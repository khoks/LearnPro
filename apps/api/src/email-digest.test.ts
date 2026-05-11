import type { LearnProDb } from "@learnpro/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildServer } from "./index.js";
import type { SessionResolver } from "./session.js";

// STORY-045 — covers GET / PUT /v1/settings/email-digest + GET / POST /v1/email/unsubscribe.

const getEmailDigestPrefs = vi.fn();
const updateEmailDigestPrefs = vi.fn();
const unsubscribeByToken = vi.fn();

vi.mock("@learnpro/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@learnpro/db")>();
  return {
    ...actual,
    getEmailDigestPrefs: (...a: Parameters<typeof actual.getEmailDigestPrefs>) =>
      getEmailDigestPrefs(...a),
    updateEmailDigestPrefs: (...a: Parameters<typeof actual.updateEmailDigestPrefs>) =>
      updateEmailDigestPrefs(...a),
    unsubscribeByToken: (...a: Parameters<typeof actual.unsubscribeByToken>) =>
      unsubscribeByToken(...a),
  };
});

const fakeDb = {} as unknown as LearnProDb;
const NULL_SESSION: SessionResolver = async () => null;
const USER_ID = "11111111-1111-1111-1111-111111111111";
const userSession =
  (user_id: string): SessionResolver =>
  async () => ({ user_id, org_id: "self", email: `${user_id}@x.y`, is_admin: false });

function buildApp(opts: { sessionResolver?: SessionResolver } = {}) {
  return buildServer({
    sessionResolver: opts.sessionResolver ?? NULL_SESSION,
    emailDigestDb: fakeDb,
  });
}

beforeEach(() => {
  getEmailDigestPrefs.mockReset().mockResolvedValue({
    daily_opt_in: false,
    weekly_opt_in: false,
    weekly_day_of_week: 1,
    unsubscribe_token: null,
  });
  updateEmailDigestPrefs.mockReset().mockImplementation(async ({ prefs }) => ({
    ...prefs,
    unsubscribe_token: "tok-stub",
  }));
  unsubscribeByToken.mockReset().mockResolvedValue({ found: true, user_id: USER_ID });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /v1/settings/email-digest", () => {
  it("returns 401 with no session", async () => {
    const app = buildApp({});
    const res = await app.inject({ method: "GET", url: "/v1/settings/email-digest" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("returns the user's email digest prefs (200)", async () => {
    const app = buildApp({ sessionResolver: userSession(USER_ID) });
    const res = await app.inject({ method: "GET", url: "/v1/settings/email-digest" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      daily_opt_in: false,
      weekly_opt_in: false,
      weekly_day_of_week: 1,
    });
    expect(getEmailDigestPrefs).toHaveBeenCalledWith(fakeDb, USER_ID);
    await app.close();
  });

  it("does not leak the unsubscribe token in the GET response", async () => {
    getEmailDigestPrefs.mockResolvedValue({
      daily_opt_in: true,
      weekly_opt_in: true,
      weekly_day_of_week: 3,
      unsubscribe_token: "supersecret",
    });
    const app = buildApp({ sessionResolver: userSession(USER_ID) });
    const res = await app.inject({ method: "GET", url: "/v1/settings/email-digest" });
    expect(res.json()).not.toHaveProperty("unsubscribe_token");
    expect(res.body).not.toContain("supersecret");
    await app.close();
  });
});

describe("PUT /v1/settings/email-digest", () => {
  const validBody = { daily_opt_in: true, weekly_opt_in: false, weekly_day_of_week: 1 };

  it("returns 401 without a session", async () => {
    const app = buildApp({});
    const res = await app.inject({
      method: "PUT",
      url: "/v1/settings/email-digest",
      payload: validBody,
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("returns 400 on a missing field", async () => {
    const app = buildApp({ sessionResolver: userSession(USER_ID) });
    const res = await app.inject({
      method: "PUT",
      url: "/v1/settings/email-digest",
      payload: { daily_opt_in: true, weekly_opt_in: false },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("returns 400 on out-of-range weekly_day_of_week", async () => {
    const app = buildApp({ sessionResolver: userSession(USER_ID) });
    const res = await app.inject({
      method: "PUT",
      url: "/v1/settings/email-digest",
      payload: { daily_opt_in: true, weekly_opt_in: false, weekly_day_of_week: 9 },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("persists the prefs and returns 200 with the saved values", async () => {
    const app = buildApp({ sessionResolver: userSession(USER_ID) });
    const res = await app.inject({
      method: "PUT",
      url: "/v1/settings/email-digest",
      payload: validBody,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(validBody);
    expect(updateEmailDigestPrefs).toHaveBeenCalledWith({
      db: fakeDb,
      user_id: USER_ID,
      org_id: "self",
      prefs: validBody,
    });
    await app.close();
  });
});

describe("GET /v1/email/unsubscribe", () => {
  it("returns 200 + a friendly success page when the token is found", async () => {
    const app = buildApp({});
    const res = await app.inject({
      method: "GET",
      url: "/v1/email/unsubscribe?token=tok-abc",
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.body).toContain("You&#39;re unsubscribed");
    expect(unsubscribeByToken).toHaveBeenCalledWith(fakeDb, "tok-abc");
    await app.close();
  });

  it("returns the friendly 'already unsubscribed' page for an unknown token", async () => {
    unsubscribeByToken.mockResolvedValue({ found: false, user_id: null });
    const app = buildApp({});
    const res = await app.inject({
      method: "GET",
      url: "/v1/email/unsubscribe?token=unknown",
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("Already unsubscribed");
    await app.close();
  });

  it("returns 400 + the unknown page when the token is missing", async () => {
    const app = buildApp({});
    const res = await app.inject({ method: "GET", url: "/v1/email/unsubscribe" });
    expect(res.statusCode).toBe(400);
    expect(res.body).toContain("Already unsubscribed");
    await app.close();
  });

  it("the success page does not include any forbidden phrases (anti-dark-pattern)", async () => {
    const app = buildApp({});
    const res = await app.inject({
      method: "GET",
      url: "/v1/email/unsubscribe?token=tok-abc",
    });
    const body = res.body;
    expect(body).not.toContain("DON'T LOSE");
    expect(body).not.toContain("DAY X");
    expect(body).not.toMatch(/burn/i);
    expect(body).not.toContain("🔥"); // 🔥
    expect(body).not.toContain("⚠️"); // ⚠️
    await app.close();
  });
});

describe("POST /v1/email/unsubscribe (RFC 8058 one-click)", () => {
  it("returns 200 + ok=true on a valid token", async () => {
    const app = buildApp({});
    const res = await app.inject({
      method: "POST",
      url: "/v1/email/unsubscribe?token=tok-abc",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(unsubscribeByToken).toHaveBeenCalledWith(fakeDb, "tok-abc");
    await app.close();
  });

  it("returns 200 + ok=true even on an unknown token (don't leak existence)", async () => {
    unsubscribeByToken.mockResolvedValue({ found: false, user_id: null });
    const app = buildApp({});
    const res = await app.inject({
      method: "POST",
      url: "/v1/email/unsubscribe?token=anything",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    await app.close();
  });

  it("returns 400 when the token is missing entirely", async () => {
    const app = buildApp({});
    const res = await app.inject({ method: "POST", url: "/v1/email/unsubscribe" });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
