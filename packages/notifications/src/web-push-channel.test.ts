import type { LearnProDb, WebPushSubscription } from "@learnpro/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebPushChannel, type WebPushSender } from "./web-push-channel.js";

const listWebPushSubscriptions = vi.fn();
const removeWebPushSubscription = vi.fn();
vi.mock("@learnpro/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@learnpro/db")>();
  return {
    ...actual,
    listWebPushSubscriptions: (...args: Parameters<typeof actual.listWebPushSubscriptions>) =>
      listWebPushSubscriptions(...args),
    removeWebPushSubscription: (...args: Parameters<typeof actual.removeWebPushSubscription>) =>
      removeWebPushSubscription(...args),
  };
});

const fakeDb = {} as unknown as LearnProDb;
const USER_ID = "11111111-1111-1111-1111-111111111111";

function makeSubscription(endpoint: string): WebPushSubscription {
  return {
    id: `id-${endpoint}`,
    org_id: "self",
    user_id: USER_ID,
    endpoint,
    p256dh: "p256",
    auth: "auth",
    created_at: new Date(),
  };
}

class StubSender implements WebPushSender {
  public calls: Array<{
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } };
    payload: string;
  }> = [];

  constructor(private readonly behavior: (endpoint: string) => Promise<unknown>) {}

  async sendNotification(
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
    payload: string,
  ): Promise<unknown> {
    this.calls.push({ subscription, payload });
    return this.behavior(subscription.endpoint);
  }
}

describe("WebPushChannel", () => {
  beforeEach(() => {
    listWebPushSubscriptions.mockReset();
    removeWebPushSubscription.mockReset().mockResolvedValue(true);
  });

  afterEach(() => {
    listWebPushSubscriptions.mockReset();
    removeWebPushSubscription.mockReset();
  });

  it("returns delivered=false reason='no_subscriptions' when the user has none", async () => {
    listWebPushSubscriptions.mockResolvedValue([]);
    const sender = new StubSender(() => Promise.resolve());
    const ch = new WebPushChannel({ db: fakeDb, sender });
    const out = await ch.send({ user_id: USER_ID, title: "x" });
    expect(out).toEqual({ delivered: false, reason: "no_subscriptions" });
    expect(sender.calls).toHaveLength(0);
  });

  it("sends to every subscription and returns delivered=true on success", async () => {
    listWebPushSubscriptions.mockResolvedValue([
      makeSubscription("https://fcm.googleapis.com/fcm/send/a"),
      makeSubscription("https://fcm.googleapis.com/fcm/send/b"),
    ]);
    const sender = new StubSender(() => Promise.resolve());
    const ch = new WebPushChannel({ db: fakeDb, sender });
    const out = await ch.send({ user_id: USER_ID, title: "Hi", body: "there" });
    expect(out).toEqual({ delivered: true });
    expect(sender.calls).toHaveLength(2);
    const payload = JSON.parse(sender.calls[0]!.payload) as {
      title: string;
      body: string;
      url: string;
    };
    expect(payload.title).toBe("Hi");
    expect(payload.body).toBe("there");
    expect(payload.url).toBe("/dashboard"); // default
  });

  it("uses metadata.url as the payload's click target when present", async () => {
    listWebPushSubscriptions.mockResolvedValue([
      makeSubscription("https://fcm.googleapis.com/fcm/send/a"),
    ]);
    const sender = new StubSender(() => Promise.resolve());
    const ch = new WebPushChannel({ db: fakeDb, sender });
    await ch.send({
      user_id: USER_ID,
      title: "Hi",
      metadata: { url: "/session?track=python-fundamentals" },
    });
    const payload = JSON.parse(sender.calls[0]!.payload) as { url: string };
    expect(payload.url).toBe("/session?track=python-fundamentals");
  });

  it("deletes a subscription that returns 410 Gone", async () => {
    listWebPushSubscriptions.mockResolvedValue([
      makeSubscription("https://fcm.googleapis.com/fcm/send/gone"),
    ]);
    const sender = new StubSender(() => {
      const e: { statusCode: number; message: string } = {
        statusCode: 410,
        message: "Gone",
      };
      return Promise.reject(e);
    });
    const ch = new WebPushChannel({ db: fakeDb, sender, log: () => {} });
    const out = await ch.send({ user_id: USER_ID, title: "x" });
    expect(out.delivered).toBe(false);
    expect(out.reason).toBe("gone_410");
    expect(removeWebPushSubscription).toHaveBeenCalledWith(
      fakeDb,
      "https://fcm.googleapis.com/fcm/send/gone",
    );
  });

  it("deletes a subscription that returns 404", async () => {
    listWebPushSubscriptions.mockResolvedValue([
      makeSubscription("https://fcm.googleapis.com/fcm/send/missing"),
    ]);
    const sender = new StubSender(() => Promise.reject({ statusCode: 404, message: "Not Found" }));
    const ch = new WebPushChannel({ db: fakeDb, sender, log: () => {} });
    const out = await ch.send({ user_id: USER_ID, title: "x" });
    expect(out.reason).toBe("gone_404");
    expect(removeWebPushSubscription).toHaveBeenCalled();
  });

  it("does not delete on a transient 5xx error", async () => {
    listWebPushSubscriptions.mockResolvedValue([
      makeSubscription("https://fcm.googleapis.com/fcm/send/flaky"),
    ]);
    const sender = new StubSender(() =>
      Promise.reject({ statusCode: 503, message: "Service Unavailable" }),
    );
    const ch = new WebPushChannel({ db: fakeDb, sender, log: () => {} });
    const out = await ch.send({ user_id: USER_ID, title: "x" });
    expect(out.delivered).toBe(false);
    expect(out.reason).toBe("send_failed_503");
    expect(removeWebPushSubscription).not.toHaveBeenCalled();
  });

  it("returns delivered=true when at least one subscription succeeds", async () => {
    listWebPushSubscriptions.mockResolvedValue([
      makeSubscription("https://fcm.googleapis.com/fcm/send/ok"),
      makeSubscription("https://fcm.googleapis.com/fcm/send/gone"),
    ]);
    const sender = new StubSender((endpoint) => {
      if (endpoint.endsWith("gone")) return Promise.reject({ statusCode: 410 });
      return Promise.resolve();
    });
    const ch = new WebPushChannel({ db: fakeDb, sender, log: () => {} });
    const out = await ch.send({ user_id: USER_ID, title: "x" });
    expect(out).toEqual({ delivered: true });
    expect(removeWebPushSubscription).toHaveBeenCalledTimes(1);
  });

  it("channel name is the literal 'web_push'", () => {
    const sender = new StubSender(() => Promise.resolve());
    const ch = new WebPushChannel({ db: fakeDb, sender });
    expect(ch.name).toBe("web_push");
  });
});
