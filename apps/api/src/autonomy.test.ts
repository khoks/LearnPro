import type { LearnProDb } from "@learnpro/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildServer } from "./index.js";
import type { SessionResolver } from "./session.js";

const getConfidenceSignal = vi.fn();
const countClosedEpisodes = vi.fn();

vi.mock("@learnpro/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@learnpro/db")>();
  return {
    ...actual,
    getConfidenceSignal: (...a: Parameters<typeof actual.getConfidenceSignal>) =>
      getConfidenceSignal(...a),
    countClosedEpisodes: (...a: Parameters<typeof actual.countClosedEpisodes>) =>
      countClosedEpisodes(...a),
  };
});

const fakeDb = {} as unknown as LearnProDb;

const userSession =
  (user_id: string): SessionResolver =>
  async () => ({ user_id, org_id: "self", email: `${user_id}@x.y`, is_admin: false });

const NULL_SESSION: SessionResolver = async () => null;
const USER_ID = "11111111-1111-1111-1111-111111111111";

function buildApp(opts: { sessionResolver?: SessionResolver }) {
  return buildServer({
    sessionResolver: opts.sessionResolver ?? NULL_SESSION,
    autonomyDb: fakeDb,
  });
}

beforeEach(() => {
  getConfidenceSignal.mockReset();
  countClosedEpisodes.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /v1/autonomy/state (STORY-054)", () => {
  it("returns 401 when no session", async () => {
    const app = buildApp({});
    const res = await app.inject({ method: "GET", url: "/v1/autonomy/state" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("returns band=low + signal=null + episode_count=0 for a brand-new user", async () => {
    getConfidenceSignal.mockResolvedValue(null);
    countClosedEpisodes.mockResolvedValue(0);
    const app = buildApp({ sessionResolver: userSession(USER_ID) });
    const res = await app.inject({ method: "GET", url: "/v1/autonomy/state" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.band).toBe("low");
    expect(body.signal).toBeNull();
    expect(body.episode_count).toBe(0);
    expect(body.cold_start_threshold).toBe(5);
    await app.close();
  });

  it("returns band=low when under the cold-start threshold even with a high signal", async () => {
    const signal = {
      agreement_rate: 0.95,
      engagement: 0.95,
      success: 0.95,
      updated_at: "2026-04-25T12:00:00.000Z",
    };
    getConfidenceSignal.mockResolvedValue(signal);
    countClosedEpisodes.mockResolvedValue(3); // < 5
    const app = buildApp({ sessionResolver: userSession(USER_ID) });
    const res = await app.inject({ method: "GET", url: "/v1/autonomy/state" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.band).toBe("low");
    expect(body.episode_count).toBe(3);
    expect(body.signal).toEqual(signal);
    await app.close();
  });

  it("returns band=medium for a mid-confidence signal past cold-start", async () => {
    const signal = {
      agreement_rate: 0.5,
      engagement: 0.5,
      success: 0.5,
      updated_at: "2026-04-25T12:00:00.000Z",
    };
    getConfidenceSignal.mockResolvedValue(signal);
    countClosedEpisodes.mockResolvedValue(15);
    const app = buildApp({ sessionResolver: userSession(USER_ID) });
    const res = await app.inject({ method: "GET", url: "/v1/autonomy/state" });
    expect(res.statusCode).toBe(200);
    expect(res.json().band).toBe("medium");
    await app.close();
  });

  it("returns band=high for a strong signal past cold-start", async () => {
    const signal = {
      agreement_rate: 0.9,
      engagement: 0.85,
      success: 0.95,
      updated_at: "2026-04-25T12:00:00.000Z",
    };
    getConfidenceSignal.mockResolvedValue(signal);
    countClosedEpisodes.mockResolvedValue(50);
    const app = buildApp({ sessionResolver: userSession(USER_ID) });
    const res = await app.inject({ method: "GET", url: "/v1/autonomy/state" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.band).toBe("high");
    expect(body.combined_score).toBeGreaterThan(0.7);
    await app.close();
  });
});
