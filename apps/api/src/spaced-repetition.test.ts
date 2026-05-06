import type { LearnProDb } from "@learnpro/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildServer } from "./index.js";
import type { SessionResolver } from "./session.js";

// STORY-031 — `GET /v1/spaced-repetition/due` route tests. We mock @learnpro/db's
// `getDueConcepts` (and `withOverdueDays` via re-export) the way other route tests in this
// folder mock their helpers — keeps the test free of a real Postgres.

const getDueConcepts = vi.fn();

vi.mock("@learnpro/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@learnpro/db")>();
  return {
    ...actual,
    getDueConcepts: (...a: Parameters<typeof actual.getDueConcepts>) => getDueConcepts(...a),
  };
});

const fakeDb = {
  select: () => ({
    from: () => ({
      where: () => Promise.resolve(fakeDb._conceptRows),
    }),
  }),
  _conceptRows: [] as Array<{ id: string; slug: string; name: string }>,
} as unknown as LearnProDb & { _conceptRows: Array<{ id: string; slug: string; name: string }> };

const userSession =
  (user_id: string): SessionResolver =>
  async () => ({ user_id, org_id: "self", email: `${user_id}@x.y` });

const NULL_SESSION: SessionResolver = async () => null;
const USER_ID = "11111111-1111-1111-1111-111111111111";

function buildApp(opts: { sessionResolver?: SessionResolver }) {
  return buildServer({
    sessionResolver: opts.sessionResolver ?? NULL_SESSION,
    spacedRepetitionDb: fakeDb,
  });
}

beforeEach(() => {
  getDueConcepts.mockReset().mockResolvedValue([]);
  fakeDb._conceptRows = [];
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /v1/spaced-repetition/due (STORY-031)", () => {
  it("returns 401 when no session", async () => {
    const app = buildApp({});
    const res = await app.inject({ method: "GET", url: "/v1/spaced-repetition/due" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("returns an empty list when nothing is due", async () => {
    const app = buildApp({ sessionResolver: userSession(USER_ID) });
    const res = await app.inject({ method: "GET", url: "/v1/spaced-repetition/due" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ due_concepts: [] });
    expect(getDueConcepts).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it("returns due_concepts joined with concept slug + name + days_overdue", async () => {
    getDueConcepts.mockResolvedValueOnce([
      {
        concept_id: "aaaa1111-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        state: {
          stability: 1,
          difficulty: 5,
          due: new Date(Date.now() - 5 * 86400_000).toISOString(),
          lapses: 0,
          last_reviewed: new Date(Date.now() - 7 * 86400_000).toISOString(),
        },
      },
    ]);
    fakeDb._conceptRows = [
      {
        id: "aaaa1111-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        slug: "loops",
        name: "For loops and iteration",
      },
    ];
    const app = buildApp({ sessionResolver: userSession(USER_ID) });
    const res = await app.inject({ method: "GET", url: "/v1/spaced-repetition/due" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      due_concepts: Array<{ slug: string; days_overdue: number; name: string }>;
    };
    expect(body.due_concepts).toHaveLength(1);
    expect(body.due_concepts[0]?.slug).toBe("loops");
    expect(body.due_concepts[0]?.name).toBe("For loops and iteration");
    expect(body.due_concepts[0]?.days_overdue).toBeGreaterThanOrEqual(4);
    await app.close();
  });

  it("silently drops a due row whose concept is missing in the DB (defensive)", async () => {
    getDueConcepts.mockResolvedValueOnce([
      {
        concept_id: "ghost-id",
        state: {
          stability: 1,
          difficulty: 5,
          due: new Date(Date.now() - 86400_000).toISOString(),
          lapses: 0,
          last_reviewed: null,
        },
      },
    ]);
    fakeDb._conceptRows = []; // no matching concept row
    const app = buildApp({ sessionResolver: userSession(USER_ID) });
    const res = await app.inject({ method: "GET", url: "/v1/spaced-repetition/due" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ due_concepts: [] });
    await app.close();
  });

  it("respects the @learnpro/db cap of 50 (the helper's contract)", async () => {
    // The route trusts the DB helper's LIMIT — we're really asserting the route doesn't expand
    // the list, only enriches and forwards it.
    const huge = Array.from({ length: 50 }, (_, i) => ({
      concept_id: `aaaa1111-aaaa-4aaa-8aaa-${String(i).padStart(12, "0")}`,
      state: {
        stability: 1,
        difficulty: 5,
        due: new Date(Date.now() - 86400_000).toISOString(),
        lapses: 0,
        last_reviewed: null,
      },
    }));
    getDueConcepts.mockResolvedValueOnce(huge);
    fakeDb._conceptRows = huge.map((r, i) => ({
      id: r.concept_id,
      slug: `concept-${i}`,
      name: `Concept ${i}`,
    }));
    const app = buildApp({ sessionResolver: userSession(USER_ID) });
    const res = await app.inject({ method: "GET", url: "/v1/spaced-repetition/due" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { due_concepts: unknown[] };
    expect(body.due_concepts).toHaveLength(50);
    await app.close();
  });
});
