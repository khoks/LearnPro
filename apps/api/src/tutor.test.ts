import {
  IllegalTransitionError,
  NoEligibleProblemError,
  TutorSession,
  type AssignProblemOutput,
  type GiveHintOutput,
  type GradeOutput,
  type TutorSessionTools,
  type UpdateProfileOutput,
} from "@learnpro/agent";
import { describe, expect, it } from "vitest";
import { buildServer } from "./index.js";
import type { SessionResolver } from "./session.js";
import type { TutorAgentFactory } from "./tutor.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const TRACK_ID = "22222222-2222-4222-8222-222222222222";
const EPISODE_ID = "33333333-3333-4333-8333-333333333333";
const PROBLEM_ID = "44444444-4444-4444-8444-444444444444";
const SUBMISSION_ID = "55555555-5555-4555-8555-555555555555";

const userSession =
  (user_id: string): SessionResolver =>
  async () => ({
    user_id,
    org_id: "self",
    email: `${user_id}@learnpro.local`,
  });

function fakeAssignOutput(): AssignProblemOutput {
  return {
    episode_id: EPISODE_ID,
    problem_id: PROBLEM_ID,
    problem_slug: "two-sum",
    problem: {
      name: "Two sum",
      language: "python",
      statement: "find indices",
      starter_code: "def solve(): pass",
      public_examples: [],
      expected_median_time_to_solve_ms: 60_000,
      concept_tags: ["arrays"],
      difficulty: 2,
    },
    difficulty_tier: "easy",
    why_this_difficulty: "cold-start",
    started_at: 1700000000000,
  };
}

function fakeGradeOutput(passed: boolean): GradeOutput {
  return {
    passed,
    hidden_test_results: [{ index: 0, passed }],
    rubric: { correctness: passed ? 1 : 0.5, idiomatic: 0.7, edge_case_coverage: 0.5 },
    prose_explanation: passed ? "ok" : "off-by-one",
    submission_id: SUBMISSION_ID,
    runtime_ms: 50,
  };
}

function fakeHintOutput(rung: 1 | 2 | 3): GiveHintOutput {
  return {
    rung,
    hint: `rung ${rung} hint`,
    xp_cost: rung === 1 ? 5 : rung === 2 ? 15 : 30,
  };
}

function fakeUpdateProfileOutput(): UpdateProfileOutput {
  return {
    episode_id: EPISODE_ID,
    final_outcome: "passed",
    time_to_solve_ms: 60000,
    attempts: 1,
    hints_used: 0,
    skill_updates: [
      {
        concept_id: "concept-arrays",
        concept_slug: "arrays",
        prev_skill: 0.5,
        next_skill: 0.6,
        next_confidence: 0.1,
        attempts: 1,
      },
    ],
  };
}

interface FakeFactoryOptions {
  // First call to assign produces an episode; subsequent loadExisting calls return a session
  // pre-positioned in `coding`.
  noProblem?: boolean;
  // When true, illegal transitions are forced (e.g., a hint request immediately after assign on
  // a session that's still in `assigned` not `coding`).
  illegal?: boolean;
}

function makeFactory(opts: FakeFactoryOptions = {}): TutorAgentFactory {
  const tools: TutorSessionTools = {
    assignProblem: {
      name: "assignProblem",
      async run() {
        if (opts.noProblem) throw new NoEligibleProblemError("easy", TRACK_ID);
        return fakeAssignOutput();
      },
    },
    giveHint: { name: "giveHint", async run({ rung }) { return fakeHintOutput(rung as 1 | 2 | 3); } },
    grade: { name: "grade", async run() { return fakeGradeOutput(true); } },
    updateProfile: { name: "updateProfile", async run() { return fakeUpdateProfileOutput(); } },
  };

  return {
    async createForAssign(input) {
      const session = new TutorSession({
        user_id: input.user_id,
        org_id: input.org_id,
        track_id: input.track_id,
        tools,
      });
      return { session, tools };
    },
    async createForExisting(input) {
      const initial_state = opts.illegal
        ? {
            phase: "done" as const,
            user_id: input.user_id,
            org_id: input.org_id,
            track_id: TRACK_ID,
            episode_id: EPISODE_ID,
            problem_id: PROBLEM_ID,
            problem_slug: "two-sum",
            hints: [],
            attempts: 0,
            final_outcome: "passed" as const,
          }
        : {
            phase: "coding" as const,
            user_id: input.user_id,
            org_id: input.org_id,
            track_id: TRACK_ID,
            episode_id: EPISODE_ID,
            problem_id: PROBLEM_ID,
            problem_slug: "two-sum",
            started_at: 1700000000000,
            hints: [],
            attempts: 0,
          };
      const session = new TutorSession({
        user_id: input.user_id,
        org_id: input.org_id,
        track_id: TRACK_ID,
        tools,
        initial_state,
      });
      return { session, tools };
    },
  };
}

function nullFactory(): TutorAgentFactory {
  return {
    async createForAssign() {
      throw new Error("nullFactory.createForAssign should not be called");
    },
    async createForExisting() {
      return null;
    },
  };
}

describe("POST /v1/tutor/episodes (STORY-011)", () => {
  it("401 when no session", async () => {
    const app = buildServer({ tutorAgentFactory: makeFactory() });
    const res = await app.inject({
      method: "POST",
      url: "/v1/tutor/episodes",
      payload: { track_id: TRACK_ID },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("400 when track_id missing", async () => {
    const app = buildServer({
      tutorAgentFactory: makeFactory(),
      sessionResolver: userSession(USER_ID),
    });
    const res = await app.inject({
      method: "POST",
      url: "/v1/tutor/episodes",
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("happy path: 201 with episode payload", async () => {
    const app = buildServer({
      tutorAgentFactory: makeFactory(),
      sessionResolver: userSession(USER_ID),
    });
    const res = await app.inject({
      method: "POST",
      url: "/v1/tutor/episodes",
      payload: { track_id: TRACK_ID },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as AssignProblemOutput;
    expect(body.problem_slug).toBe("two-sum");
    expect(body.episode_id).toBe(EPISODE_ID);
    expect(body.why_this_difficulty.toLowerCase()).toContain("cold-start");
    await app.close();
  });

  it("404 when no eligible problem (NoEligibleProblemError)", async () => {
    const app = buildServer({
      tutorAgentFactory: makeFactory({ noProblem: true }),
      sessionResolver: userSession(USER_ID),
    });
    const res = await app.inject({
      method: "POST",
      url: "/v1/tutor/episodes",
      payload: { track_id: TRACK_ID },
    });
    expect(res.statusCode).toBe(404);
    expect((res.json() as { error: string }).error).toBe("no_eligible_problem");
    await app.close();
  });
});

describe("POST /v1/tutor/episodes/:id/hint (STORY-011)", () => {
  it("401 when no session", async () => {
    const app = buildServer({ tutorAgentFactory: makeFactory() });
    const res = await app.inject({
      method: "POST",
      url: `/v1/tutor/episodes/${EPISODE_ID}/hint`,
      payload: { rung: 1 },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("404 when episode not found", async () => {
    const app = buildServer({
      tutorAgentFactory: nullFactory(),
      sessionResolver: userSession(USER_ID),
    });
    const res = await app.inject({
      method: "POST",
      url: `/v1/tutor/episodes/${EPISODE_ID}/hint`,
      payload: { rung: 1 },
    });
    expect(res.statusCode).toBe(404);
    expect((res.json() as { error: string }).error).toBe("episode_not_found");
    await app.close();
  });

  it("happy path: returns the hint with correct xp_cost", async () => {
    const app = buildServer({
      tutorAgentFactory: makeFactory(),
      sessionResolver: userSession(USER_ID),
    });
    const res = await app.inject({
      method: "POST",
      url: `/v1/tutor/episodes/${EPISODE_ID}/hint`,
      payload: { rung: 2 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as GiveHintOutput;
    expect(body.rung).toBe(2);
    expect(body.xp_cost).toBe(15);
    await app.close();
  });

  it("400 when rung is invalid", async () => {
    const app = buildServer({
      tutorAgentFactory: makeFactory(),
      sessionResolver: userSession(USER_ID),
    });
    const res = await app.inject({
      method: "POST",
      url: `/v1/tutor/episodes/${EPISODE_ID}/hint`,
      payload: { rung: 4 },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("409 when hint requested in illegal state (e.g., session already done)", async () => {
    const app = buildServer({
      tutorAgentFactory: makeFactory({ illegal: true }),
      sessionResolver: userSession(USER_ID),
    });
    const res = await app.inject({
      method: "POST",
      url: `/v1/tutor/episodes/${EPISODE_ID}/hint`,
      payload: { rung: 1 },
    });
    expect(res.statusCode).toBe(409);
    expect((res.json() as { error: string }).error).toBe("illegal_transition");
    await app.close();
  });
});

describe("POST /v1/tutor/episodes/:id/submit (STORY-011)", () => {
  it("401 unauth", async () => {
    const app = buildServer({ tutorAgentFactory: makeFactory() });
    const res = await app.inject({
      method: "POST",
      url: `/v1/tutor/episodes/${EPISODE_ID}/submit`,
      payload: { code: "x" },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("400 when code missing", async () => {
    const app = buildServer({
      tutorAgentFactory: makeFactory(),
      sessionResolver: userSession(USER_ID),
    });
    const res = await app.inject({
      method: "POST",
      url: `/v1/tutor/episodes/${EPISODE_ID}/submit`,
      payload: { code: "" },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("happy path: returns grade payload", async () => {
    const app = buildServer({
      tutorAgentFactory: makeFactory(),
      sessionResolver: userSession(USER_ID),
    });
    const res = await app.inject({
      method: "POST",
      url: `/v1/tutor/episodes/${EPISODE_ID}/submit`,
      payload: { code: "def solve(): return [0,1]" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as GradeOutput;
    expect(body.passed).toBe(true);
    expect(body.rubric.correctness).toBe(1);
    expect(body.submission_id).toBe(SUBMISSION_ID);
    await app.close();
  });

  it("404 when episode not found", async () => {
    const app = buildServer({
      tutorAgentFactory: nullFactory(),
      sessionResolver: userSession(USER_ID),
    });
    const res = await app.inject({
      method: "POST",
      url: `/v1/tutor/episodes/${EPISODE_ID}/submit`,
      payload: { code: "x" },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe("POST /v1/tutor/episodes/:id/finish (STORY-011)", () => {
  it("401 unauth", async () => {
    const app = buildServer({ tutorAgentFactory: makeFactory() });
    const res = await app.inject({
      method: "POST",
      url: `/v1/tutor/episodes/${EPISODE_ID}/finish`,
      payload: {},
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("happy path: abandoned without submitting first", async () => {
    const app = buildServer({
      tutorAgentFactory: makeFactory(),
      sessionResolver: userSession(USER_ID),
    });
    const res = await app.inject({
      method: "POST",
      url: `/v1/tutor/episodes/${EPISODE_ID}/finish`,
      payload: { outcome: "abandoned" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as UpdateProfileOutput;
    expect(body.episode_id).toBe(EPISODE_ID);
    await app.close();
  });

  it("409 when finishing an already-done session", async () => {
    const app = buildServer({
      tutorAgentFactory: makeFactory({ illegal: true }),
      sessionResolver: userSession(USER_ID),
    });
    const res = await app.inject({
      method: "POST",
      url: `/v1/tutor/episodes/${EPISODE_ID}/finish`,
      payload: {},
    });
    expect(res.statusCode).toBe(409);
    await app.close();
  });

  it("404 when episode not found", async () => {
    const app = buildServer({
      tutorAgentFactory: nullFactory(),
      sessionResolver: userSession(USER_ID),
    });
    const res = await app.inject({
      method: "POST",
      url: `/v1/tutor/episodes/${EPISODE_ID}/finish`,
      payload: {},
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

// Sanity check that IllegalTransitionError is wired through the global handler when thrown from
// the factory (not just the session). This guards against regressions where a future tool throws
// the error itself.
describe("tutor errors → HTTP mapping", () => {
  it("IllegalTransitionError thrown from a tool surfaces as 409", async () => {
    const factory: TutorAgentFactory = {
      async createForAssign() {
        throw new IllegalTransitionError("idle", "assign");
      },
      async createForExisting() {
        return null;
      },
    };
    const app = buildServer({
      tutorAgentFactory: factory,
      sessionResolver: userSession(USER_ID),
    });
    const res = await app.inject({
      method: "POST",
      url: "/v1/tutor/episodes",
      payload: { track_id: TRACK_ID },
    });
    expect(res.statusCode).toBe(409);
    await app.close();
  });
});
