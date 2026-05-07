import type { LearnProDb } from "@learnpro/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildServer } from "./index.js";
import type { SessionResolver } from "./session.js";

const listBugFindingScores = vi.fn();

vi.mock("@learnpro/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@learnpro/db")>();
  return {
    ...actual,
    listBugFindingScores: (...a: Parameters<typeof actual.listBugFindingScores>) =>
      listBugFindingScores(...a),
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
    bugFindingScoresDb: fakeDb,
  });
}

beforeEach(() => {
  listBugFindingScores.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /v1/bug-finding-scores (STORY-037a)", () => {
  it("returns 401 when no session", async () => {
    const app = buildApp({});
    const res = await app.inject({ method: "GET", url: "/v1/bug-finding-scores" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("returns the per-archetype scores for an authenticated user", async () => {
    listBugFindingScores.mockResolvedValue([
      { archetype: "async_race", score: 0.5, confidence: 0, attempts: 0 },
      { archetype: "default_arg_mutability", score: 0.5, confidence: 0, attempts: 0 },
      { archetype: "late_binding", score: 0.5, confidence: 0, attempts: 0 },
      { archetype: "mutation_in_iteration", score: 0.5, confidence: 0, attempts: 0 },
      { archetype: "off_by_one", score: 0.7, confidence: 0.1, attempts: 1 },
      { archetype: "reference_equality", score: 0.5, confidence: 0, attempts: 0 },
      { archetype: "shadowing", score: 0.5, confidence: 0, attempts: 0 },
      { archetype: "type_coercion", score: 0.5, confidence: 0, attempts: 0 },
    ]);
    const app = buildApp({ sessionResolver: userSession(USER_ID) });
    const res = await app.inject({ method: "GET", url: "/v1/bug-finding-scores" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.scores).toHaveLength(8);
    const offByOne = body.scores.find(
      (s: { bug_archetype: string }) => s.bug_archetype === "off_by_one",
    );
    expect(offByOne).toEqual({
      bug_archetype: "off_by_one",
      score: 0.7,
      confidence: 0.1,
      attempts: 1,
    });
  });

  it("calls listBugFindingScores with the session's user_id + org_id", async () => {
    listBugFindingScores.mockResolvedValue([]);
    const app = buildApp({ sessionResolver: userSession(USER_ID) });
    await app.inject({ method: "GET", url: "/v1/bug-finding-scores" });
    expect(listBugFindingScores).toHaveBeenCalledWith(fakeDb, USER_ID, "self");
    await app.close();
  });
});
