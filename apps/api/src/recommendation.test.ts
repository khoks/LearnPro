import type { LearnProDb, TrackSummary } from "@learnpro/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildServer } from "./index.js";
import type { SessionResolver } from "./session.js";

// Mock the @learnpro/db helpers the route handler reaches into. The route only touches two:
// `getProfileTargetRole` (read profile) and `getTracksBySlugs` (hydrate role-mapped slugs).
const getProfileTargetRole = vi.fn();
const getTracksBySlugs = vi.fn();

vi.mock("@learnpro/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@learnpro/db")>();
  return {
    ...actual,
    getProfileTargetRole: (...a: Parameters<typeof actual.getProfileTargetRole>) =>
      getProfileTargetRole(...a),
    getTracksBySlugs: (...a: Parameters<typeof actual.getTracksBySlugs>) => getTracksBySlugs(...a),
  };
});

const fakeDb = {} as unknown as LearnProDb;

const userSession =
  (user_id: string): SessionResolver =>
  async () => ({ user_id, org_id: "self", email: `${user_id}@x.y` });

const NULL_SESSION: SessionResolver = async () => null;
const USER_ID = "11111111-1111-1111-1111-111111111111";

const PYTHON_TRACK: TrackSummary = {
  slug: "python-fundamentals",
  name: "Python fundamentals",
  language: "python",
  description: "Variables, loops, functions, lists.",
};

const TS_TRACK: TrackSummary = {
  slug: "typescript-fundamentals",
  name: "TypeScript fundamentals",
  language: "typescript",
  description: "Types, generics, modules.",
};

function buildApp(opts: { sessionResolver?: SessionResolver }) {
  return buildServer({
    sessionResolver: opts.sessionResolver ?? NULL_SESSION,
    recommendationDb: fakeDb,
  });
}

beforeEach(() => {
  getProfileTargetRole.mockReset();
  getTracksBySlugs.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /v1/recommendation (STORY-021)", () => {
  it("returns 401 when no session", async () => {
    const app = buildApp({});
    const res = await app.inject({ method: "GET", url: "/v1/recommendation" });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "unauthorized" });
    await app.close();
  });

  it("returns 200 with role=null when the user has no profile yet", async () => {
    getProfileTargetRole.mockResolvedValue(null);
    const app = buildApp({ sessionResolver: userSession(USER_ID) });
    const res = await app.inject({ method: "GET", url: "/v1/recommendation" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      role: null,
      recommended_tracks: [],
      recommended_daily_minutes: null,
    });
    expect(getProfileTargetRole).toHaveBeenCalledWith(fakeDb, USER_ID);
    expect(getTracksBySlugs).not.toHaveBeenCalled();
    await app.close();
  });

  it("returns 200 with role=null when target_role is null on the profile", async () => {
    // Pre-onboarding bootstrap state: profile row exists but target_role still null.
    getProfileTargetRole.mockResolvedValue({ target_role: null });
    const app = buildApp({ sessionResolver: userSession(USER_ID) });
    const res = await app.inject({ method: "GET", url: "/v1/recommendation" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      role: null,
      recommended_tracks: [],
      recommended_daily_minutes: null,
    });
    expect(getTracksBySlugs).not.toHaveBeenCalled();
    await app.close();
  });

  it("returns the recommendation with multiple tracks for backend-engineer", async () => {
    getProfileTargetRole.mockResolvedValue({ target_role: "backend-engineer" });
    getTracksBySlugs.mockResolvedValue([PYTHON_TRACK, TS_TRACK]);
    const app = buildApp({ sessionResolver: userSession(USER_ID) });
    const res = await app.inject({ method: "GET", url: "/v1/recommendation" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      role: { slug: "backend-engineer", label: "Backend engineer", bias: "standard" },
      recommended_tracks: [PYTHON_TRACK, TS_TRACK],
      recommended_daily_minutes: 45,
    });
    // Order matters — the role library says python-first, then typescript.
    expect(getTracksBySlugs).toHaveBeenCalledWith(
      fakeDb,
      ["python-fundamentals", "typescript-fundamentals"],
      "self",
    );
    await app.close();
  });

  it("returns role=null when target_role is unknown to the library (free choice, no soft-locks)", async () => {
    getProfileTargetRole.mockResolvedValue({ target_role: "astronaut" });
    const app = buildApp({ sessionResolver: userSession(USER_ID) });
    const res = await app.inject({ method: "GET", url: "/v1/recommendation" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      role: null,
      recommended_tracks: [],
      recommended_daily_minutes: null,
    });
    expect(getTracksBySlugs).not.toHaveBeenCalled();
    await app.close();
  });

  it("looks up case-insensitively (e.g. user typed 'Backend-Engineer')", async () => {
    getProfileTargetRole.mockResolvedValue({ target_role: "Backend-Engineer" });
    getTracksBySlugs.mockResolvedValue([PYTHON_TRACK, TS_TRACK]);
    const app = buildApp({ sessionResolver: userSession(USER_ID) });
    const res = await app.inject({ method: "GET", url: "/v1/recommendation" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      role: { slug: "backend-engineer", label: "Backend engineer" },
    });
    await app.close();
  });

  it("returns ml-engineer's math-heavy bias and 60-min budget", async () => {
    getProfileTargetRole.mockResolvedValue({ target_role: "ml-engineer" });
    getTracksBySlugs.mockResolvedValue([PYTHON_TRACK]);
    const app = buildApp({ sessionResolver: userSession(USER_ID) });
    const res = await app.inject({ method: "GET", url: "/v1/recommendation" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      role: { slug: "ml-engineer", label: "ML engineer", bias: "math-heavy" },
      recommended_tracks: [PYTHON_TRACK],
      recommended_daily_minutes: 60,
    });
    await app.close();
  });

  it("drops missing track rows when a recommended slug has no row yet (defensive)", async () => {
    getProfileTargetRole.mockResolvedValue({ target_role: "backend-engineer" });
    // Simulate the `tracks` table only having Python seeded (TS not yet seeded). The route
    // forwards getTracksBySlugs's output verbatim — getTracksBySlugs is the one that drops misses.
    getTracksBySlugs.mockResolvedValue([PYTHON_TRACK]);
    const app = buildApp({ sessionResolver: userSession(USER_ID) });
    const res = await app.inject({ method: "GET", url: "/v1/recommendation" });
    expect(res.statusCode).toBe(200);
    expect(res.json().recommended_tracks).toEqual([PYTHON_TRACK]);
    expect(res.json().recommended_daily_minutes).toBe(45);
    await app.close();
  });
});
