import type { LearnProDb, NewNotification, Notification } from "@learnpro/db";
import {
  InAppChannel,
  NotificationDispatcher,
  WebPushChannel,
  type NotificationChannel,
  type WebPushSender,
} from "@learnpro/notifications";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildServer } from "./index.js";
import type { SessionResolver } from "./session.js";

// Mock the @learnpro/db helpers the in-app channel + the route handlers reach into. Drizzle's
// chainable builder is faked with a tiny in-memory store so the channel and the routes can
// both operate on it without Postgres.
const findRecentDuplicate = vi.fn();
const listRecentNotifications = vi.fn();
const markRead = vi.fn();
const markAllRead = vi.fn();
const unreadCount = vi.fn();
const addWebPushSubscription = vi.fn();
const listWebPushSubscriptions = vi.fn();
const removeWebPushSubscription = vi.fn();

vi.mock("@learnpro/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@learnpro/db")>();
  return {
    ...actual,
    findRecentDuplicate: (...a: Parameters<typeof actual.findRecentDuplicate>) =>
      findRecentDuplicate(...a),
    listRecentNotifications: (...a: Parameters<typeof actual.listRecentNotifications>) =>
      listRecentNotifications(...a),
    markRead: (...a: Parameters<typeof actual.markRead>) => markRead(...a),
    markAllRead: (...a: Parameters<typeof actual.markAllRead>) => markAllRead(...a),
    unreadCount: (...a: Parameters<typeof actual.unreadCount>) => unreadCount(...a),
    addWebPushSubscription: (...a: Parameters<typeof actual.addWebPushSubscription>) =>
      addWebPushSubscription(...a),
    listWebPushSubscriptions: (...a: Parameters<typeof actual.listWebPushSubscriptions>) =>
      listWebPushSubscriptions(...a),
    removeWebPushSubscription: (...a: Parameters<typeof actual.removeWebPushSubscription>) =>
      removeWebPushSubscription(...a),
  };
});

interface InsertCapture {
  values: NewNotification[];
}
function makeFakeDb(): { db: LearnProDb; captures: InsertCapture[] } {
  const captures: InsertCapture[] = [];
  const db = {
    insert: () => ({
      values: (rows: NewNotification[] | NewNotification) => {
        captures.push({ values: Array.isArray(rows) ? rows : [rows] });
        return Promise.resolve();
      },
    }),
  } as unknown as LearnProDb;
  return { db, captures };
}

const userSession =
  (user_id: string): SessionResolver =>
  async () => ({ user_id, org_id: "self", email: `${user_id}@x.y` });

const NULL_SESSION: SessionResolver = async () => null;
const USER_ID = "11111111-1111-1111-1111-111111111111";

class FakeWebPushSender implements WebPushSender {
  public calls: Array<{ endpoint: string; payload: string }> = [];
  constructor(
    private readonly behavior: (endpoint: string) => Promise<unknown> = () => Promise.resolve(),
  ) {}
  async sendNotification(
    sub: { endpoint: string; keys: { p256dh: string; auth: string } },
    payload: string,
  ) {
    this.calls.push({ endpoint: sub.endpoint, payload });
    return this.behavior(sub.endpoint);
  }
}

function buildNotificationsApp(opts: {
  sessionResolver?: SessionResolver;
  vapidPublicKey?: string;
  sender?: WebPushSender;
  channels?: ReadonlyArray<NotificationChannel>;
}) {
  const { db } = makeFakeDb();
  const channels = opts.channels ?? [
    new InAppChannel({ db }),
    new WebPushChannel({ db, sender: opts.sender ?? new FakeWebPushSender(), log: () => {} }),
  ];
  const dispatcher = new NotificationDispatcher({ channels, log: () => {} });
  return buildServer({
    sessionResolver: opts.sessionResolver ?? NULL_SESSION,
    notifications: {
      db,
      dispatcher,
      vapidPublicKey: opts.vapidPublicKey ?? "BFakeVapidKey",
    },
  });
}

beforeEach(() => {
  findRecentDuplicate.mockReset().mockResolvedValue(null);
  listRecentNotifications.mockReset().mockResolvedValue([]);
  markRead.mockReset().mockResolvedValue(true);
  markAllRead.mockReset().mockResolvedValue(0);
  unreadCount.mockReset().mockResolvedValue(0);
  addWebPushSubscription.mockReset().mockResolvedValue({
    id: "sub-1",
    org_id: "self",
    user_id: USER_ID,
    endpoint: "x",
    p256dh: "p",
    auth: "a",
    created_at: new Date(),
  });
  listWebPushSubscriptions.mockReset().mockResolvedValue([]);
  removeWebPushSubscription.mockReset().mockResolvedValue(true);
});
afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /v1/notifications/vapid-key (STORY-023)", () => {
  it("returns the public key (no auth needed)", async () => {
    const app = buildNotificationsApp({ vapidPublicKey: "BFakeVapidKey" });
    const res = await app.inject({ method: "GET", url: "/v1/notifications/vapid-key" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ public_key: "BFakeVapidKey" });
    await app.close();
  });

  it("returns 503 when VAPID is unconfigured", async () => {
    const app = buildNotificationsApp({ vapidPublicKey: "" });
    const res = await app.inject({ method: "GET", url: "/v1/notifications/vapid-key" });
    expect(res.statusCode).toBe(503);
    await app.close();
  });
});

describe("GET /v1/notifications (STORY-023)", () => {
  it("returns 401 when no session", async () => {
    const app = buildNotificationsApp({});
    const res = await app.inject({ method: "GET", url: "/v1/notifications" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("returns the user's recent items + unread_count", async () => {
    const sample: Notification[] = [
      {
        id: "n1",
        org_id: "self",
        user_id: USER_ID,
        channel: "in_app",
        title: "Time to practice",
        body: "Whenever you're ready.",
        sent_at: new Date("2026-05-01T09:00:00Z"),
        read_at: null,
        dedupe_key: "daily-20260501",
      },
    ];
    listRecentNotifications.mockResolvedValue(sample);
    unreadCount.mockResolvedValue(1);
    const app = buildNotificationsApp({ sessionResolver: userSession(USER_ID) });
    const res = await app.inject({ method: "GET", url: "/v1/notifications" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      items: Array<{ id: string; title: string; sent_at: string; read_at: string | null }>;
      unread_count: number;
    };
    expect(body.unread_count).toBe(1);
    expect(body.items[0]?.title).toBe("Time to practice");
    expect(body.items[0]?.sent_at).toBe("2026-05-01T09:00:00.000Z");
    await app.close();
  });
});

describe("POST /v1/notifications/:id/read (STORY-023)", () => {
  const ID = "22222222-2222-2222-2222-222222222222";
  it("returns 401 when no session", async () => {
    const app = buildNotificationsApp({});
    const res = await app.inject({ method: "POST", url: `/v1/notifications/${ID}/read` });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
  it("returns 400 on a non-uuid id", async () => {
    const app = buildNotificationsApp({ sessionResolver: userSession(USER_ID) });
    const res = await app.inject({ method: "POST", url: `/v1/notifications/not-a-uuid/read` });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
  it("returns 404 when markRead reports no row updated", async () => {
    markRead.mockResolvedValue(false);
    const app = buildNotificationsApp({ sessionResolver: userSession(USER_ID) });
    const res = await app.inject({ method: "POST", url: `/v1/notifications/${ID}/read` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
  it("returns 200 + ok=true when markRead succeeds", async () => {
    markRead.mockResolvedValue(true);
    const app = buildNotificationsApp({ sessionResolver: userSession(USER_ID) });
    const res = await app.inject({ method: "POST", url: `/v1/notifications/${ID}/read` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    await app.close();
  });
});

describe("POST /v1/notifications/read-all (STORY-023)", () => {
  it("returns 401 when no session", async () => {
    const app = buildNotificationsApp({});
    const res = await app.inject({ method: "POST", url: "/v1/notifications/read-all" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
  it("returns the count of flipped rows", async () => {
    markAllRead.mockResolvedValue(7);
    const app = buildNotificationsApp({ sessionResolver: userSession(USER_ID) });
    const res = await app.inject({ method: "POST", url: "/v1/notifications/read-all" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, flipped: 7 });
    await app.close();
  });
});

describe("POST /v1/notifications/subscribe (STORY-023)", () => {
  const validBody = {
    endpoint: "https://fcm.googleapis.com/fcm/send/abc",
    keys: { p256dh: "p", auth: "a" },
  };

  it("returns 401 when no session", async () => {
    const app = buildNotificationsApp({});
    const res = await app.inject({
      method: "POST",
      url: "/v1/notifications/subscribe",
      payload: validBody,
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
  it("returns 503 when VAPID unconfigured", async () => {
    const app = buildNotificationsApp({
      sessionResolver: userSession(USER_ID),
      vapidPublicKey: "",
    });
    const res = await app.inject({
      method: "POST",
      url: "/v1/notifications/subscribe",
      payload: validBody,
    });
    expect(res.statusCode).toBe(503);
    await app.close();
  });
  it("returns 400 on a malformed body", async () => {
    const app = buildNotificationsApp({ sessionResolver: userSession(USER_ID) });
    const res = await app.inject({
      method: "POST",
      url: "/v1/notifications/subscribe",
      payload: { endpoint: "not-a-url", keys: { p256dh: "", auth: "a" } },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
  it("returns 201 + the new subscription's id on success", async () => {
    const app = buildNotificationsApp({ sessionResolver: userSession(USER_ID) });
    const res = await app.inject({
      method: "POST",
      url: "/v1/notifications/subscribe",
      payload: validBody,
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { id: string };
    expect(body.id).toBe("sub-1");
    expect(addWebPushSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: USER_ID,
        endpoint: validBody.endpoint,
        p256dh: "p",
        auth: "a",
      }),
    );
    await app.close();
  });
});

describe("POST /v1/notifications/test-push (STORY-023)", () => {
  const SUB = {
    id: "sub-1",
    org_id: "self",
    user_id: USER_ID,
    endpoint: "https://fcm.googleapis.com/fcm/send/abc",
    p256dh: "p",
    auth: "a",
    created_at: new Date(),
  };

  it("returns 401 when no session", async () => {
    const app = buildNotificationsApp({});
    const res = await app.inject({ method: "POST", url: "/v1/notifications/test-push" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
  it("returns 503 when VAPID unconfigured", async () => {
    const app = buildNotificationsApp({
      sessionResolver: userSession(USER_ID),
      vapidPublicKey: "",
    });
    const res = await app.inject({ method: "POST", url: "/v1/notifications/test-push" });
    expect(res.statusCode).toBe(503);
    await app.close();
  });
  it("returns delivered=true when at least one subscription delivered", async () => {
    listWebPushSubscriptions.mockResolvedValue([SUB]);
    const sender = new FakeWebPushSender();
    const app = buildNotificationsApp({
      sessionResolver: userSession(USER_ID),
      sender,
    });
    const res = await app.inject({ method: "POST", url: "/v1/notifications/test-push" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ delivered: true });
    expect(sender.calls).toHaveLength(1);
    const payload = JSON.parse(sender.calls[0]!.payload) as { title: string };
    expect(payload.title).toBe("Push is working");
    await app.close();
  });
  it("returns delivered=false reason='no_subscriptions' when there are none", async () => {
    listWebPushSubscriptions.mockResolvedValue([]);
    const app = buildNotificationsApp({ sessionResolver: userSession(USER_ID) });
    const res = await app.inject({ method: "POST", url: "/v1/notifications/test-push" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ delivered: false, reason: "no_subscriptions" });
    await app.close();
  });
});

describe("dedupe enforcement on the in-app channel via the dispatcher", () => {
  it("a same-key dispatch in the window reports duplicate (no double-insert)", async () => {
    const { db } = makeFakeDb();
    const insertedTitles: string[] = [];
    const dbSpy = {
      insert: () => ({
        values: (row: NewNotification | NewNotification[]) => {
          const rows = Array.isArray(row) ? row : [row];
          for (const r of rows) insertedTitles.push(r.title);
          return Promise.resolve();
        },
      }),
    } as unknown as LearnProDb;
    findRecentDuplicate.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: "x",
      org_id: "self",
      user_id: USER_ID,
      channel: "in_app",
      title: "Time to practice",
      body: null,
      sent_at: new Date(),
      read_at: null,
      dedupe_key: "daily-20260501",
    });
    void db;
    const ch = new InAppChannel({ db: dbSpy });
    const dispatcher = new NotificationDispatcher({ channels: [ch], log: () => {} });
    const first = await dispatcher.dispatch({
      user_id: USER_ID,
      title: "Time to practice",
      dedupe_key: "daily-20260501",
    });
    const second = await dispatcher.dispatch({
      user_id: USER_ID,
      title: "Time to practice",
      dedupe_key: "daily-20260501",
    });
    expect(first.results[0]?.delivered).toBe(true);
    expect(second.results[0]?.delivered).toBe(false);
    expect(second.results[0]?.reason).toBe("duplicate");
    expect(insertedTitles).toEqual(["Time to practice"]);
  });
});
