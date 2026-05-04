import type { LearnProDb } from "@learnpro/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildServer } from "./index.js";
import type { SessionResolver } from "./session.js";

// Mock the @learnpro/db helpers the route handlers reach into.
const getQuietHoursConfig = vi.fn();
const updateQuietHoursConfig = vi.fn();

vi.mock("@learnpro/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@learnpro/db")>();
  return {
    ...actual,
    getQuietHoursConfig: (...a: Parameters<typeof actual.getQuietHoursConfig>) =>
      getQuietHoursConfig(...a),
    updateQuietHoursConfig: (...a: Parameters<typeof actual.updateQuietHoursConfig>) =>
      updateQuietHoursConfig(...a),
  };
});

const fakeDb = {} as unknown as LearnProDb;

const userSession =
  (user_id: string): SessionResolver =>
  async () => ({ user_id, org_id: "self", email: `${user_id}@x.y` });

const NULL_SESSION: SessionResolver = async () => null;
const USER_ID = "11111111-1111-1111-1111-111111111111";

function buildApp(opts: { sessionResolver?: SessionResolver }) {
  return buildServer({
    sessionResolver: opts.sessionResolver ?? NULL_SESSION,
    quietHoursDb: fakeDb,
  });
}

beforeEach(() => {
  getQuietHoursConfig.mockReset().mockResolvedValue({
    enabled: true,
    start_min: 22 * 60,
    end_min: 8 * 60,
    timezone: "UTC",
  });
  updateQuietHoursConfig.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /v1/settings/quiet-hours (STORY-024)", () => {
  it("returns 401 when no session", async () => {
    const app = buildApp({});
    const res = await app.inject({ method: "GET", url: "/v1/settings/quiet-hours" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("returns the user's quiet-hours config (200)", async () => {
    const app = buildApp({ sessionResolver: userSession(USER_ID) });
    const res = await app.inject({ method: "GET", url: "/v1/settings/quiet-hours" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      enabled: true,
      start_min: 22 * 60,
      end_min: 8 * 60,
      timezone: "UTC",
    });
    expect(getQuietHoursConfig).toHaveBeenCalledWith(fakeDb, USER_ID);
    await app.close();
  });
});

describe("PUT /v1/settings/quiet-hours (STORY-024)", () => {
  const validBody = {
    enabled: true,
    start_min: 23 * 60,
    end_min: 7 * 60,
    timezone: "America/Los_Angeles",
  };

  it("returns 401 when no session", async () => {
    const app = buildApp({});
    const res = await app.inject({
      method: "PUT",
      url: "/v1/settings/quiet-hours",
      payload: validBody,
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("returns 400 on a malformed body (missing field)", async () => {
    const app = buildApp({ sessionResolver: userSession(USER_ID) });
    const res = await app.inject({
      method: "PUT",
      url: "/v1/settings/quiet-hours",
      payload: { enabled: true, start_min: 22 * 60, end_min: 8 * 60 }, // no timezone
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("returns 400 when the timezone fails the IANA refinement", async () => {
    const app = buildApp({ sessionResolver: userSession(USER_ID) });
    const res = await app.inject({
      method: "PUT",
      url: "/v1/settings/quiet-hours",
      payload: { ...validBody, timezone: "Mars/Olympus_Mons" },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("accepts a wrap-around window (start > end) — that's the default, after all", async () => {
    const app = buildApp({ sessionResolver: userSession(USER_ID) });
    const res = await app.inject({
      method: "PUT",
      url: "/v1/settings/quiet-hours",
      payload: { enabled: true, start_min: 22 * 60, end_min: 8 * 60, timezone: "UTC" },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it("returns 200 + persists via updateQuietHoursConfig", async () => {
    const app = buildApp({ sessionResolver: userSession(USER_ID) });
    const res = await app.inject({
      method: "PUT",
      url: "/v1/settings/quiet-hours",
      payload: validBody,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(validBody);
    expect(updateQuietHoursConfig).toHaveBeenCalledWith({
      db: fakeDb,
      user_id: USER_ID,
      org_id: "self",
      config: validBody,
    });
    await app.close();
  });
});
