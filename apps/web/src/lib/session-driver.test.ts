import type { AssignProblemOutput, GradeOutput, UpdateProfileOutput } from "@learnpro/agent";
import { describe, expect, it, vi } from "vitest";
import { driveAssign, driveFinish, driveHint, driveSubmit } from "./session-driver";
import { initialSessionState, type SessionState } from "./session-state";

const TRACK_ID = "11111111-1111-4111-8111-111111111111";
const EPISODE_ID = "22222222-2222-4222-8222-222222222222";
const PROBLEM_ID = "33333333-3333-4333-8333-333333333333";

const assignBody: AssignProblemOutput = {
  episode_id: EPISODE_ID,
  problem_id: PROBLEM_ID,
  problem_slug: "two-sum",
  problem: {
    name: "Two Sum",
    language: "python",
    statement: "Find two numbers that add up to target.",
    starter_code: "def two_sum(nums, target):\n    pass\n",
    public_examples: [],
    expected_median_time_to_solve_ms: 600_000,
    concept_tags: ["arrays"],
    difficulty: 2,
  },
  difficulty_tier: "easy",
  why_this_difficulty: "cold-start: starting at easy",
  started_at: 1_700_000_000_000,
};

const passingGrade: GradeOutput = {
  passed: true,
  hidden_test_results: [
    { index: 0, passed: true },
    { index: 1, passed: true },
  ],
  rubric: { correctness: 1.0, idiomatic: 0.85, edge_case_coverage: 0.9 },
  prose_explanation: "Clean.",
  submission_id: "44444444-4444-4444-8444-444444444444",
  runtime_ms: 12,
};

const failingGrade: GradeOutput = {
  passed: false,
  hidden_test_results: [{ index: 0, passed: false, expected: 3, got: 2 }],
  rubric: { correctness: 0.5, idiomatic: 0.4, edge_case_coverage: 0.3 },
  prose_explanation: "Off-by-one.",
  submission_id: "55555555-5555-4555-8555-555555555555",
  runtime_ms: 8,
};

const profile: UpdateProfileOutput = {
  episode_id: EPISODE_ID,
  final_outcome: "passed",
  time_to_solve_ms: 480_000,
  attempts: 1,
  hints_used: 0,
  skill_updates: [
    {
      concept_id: "66666666-6666-4666-8666-666666666666",
      concept_slug: "arrays",
      prev_skill: 0.5,
      next_skill: 0.62,
      next_confidence: 0.4,
      attempts: 1,
    },
  ],
};

const hint1Body = { rung: 1 as const, hint: "Think about pairs.", xp_cost: 5 };
const hint2Body = { rung: 2 as const, hint: "Use a hashmap.", xp_cost: 15 };

// Builds a fake fetch that returns scripted responses keyed by URL substring. Each entry is
// consumed in order so we can verify the proxy was called the expected number of times.
function scriptedFetch(plan: ReadonlyArray<{ urlMatches: string; status: number; body: unknown }>) {
  const queue = [...plan];
  return vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const idx = queue.findIndex((p) => url.includes(p.urlMatches));
    if (idx < 0) throw new Error(`unexpected fetch ${url} (remaining=${queue.length})`);
    const next = queue[idx]!;
    queue.splice(idx, 1);
    return new Response(JSON.stringify(next.body), {
      status: next.status,
      headers: { "content-type": "application/json" },
    });
  });
}

describe("session-driver: happy-path session loop (assign → submit → finish)", () => {
  it("walks assigning → coding → grading → finished and produces the right state at each step", async () => {
    const fetchImpl = scriptedFetch([
      { urlMatches: "/api/tutor/episodes", status: 201, body: assignBody },
      { urlMatches: `${EPISODE_ID}/submit`, status: 200, body: passingGrade },
      { urlMatches: `${EPISODE_ID}/finish`, status: 200, body: profile },
    ]);

    let state: SessionState = initialSessionState;
    expect(state.phase).toBe("assigning");

    const a = await driveAssign(state, TRACK_ID, { fetchImpl });
    state = a.state;
    expect(state.phase).toBe("coding");
    if (state.phase === "coding") {
      expect(state.assigned.problem_slug).toBe("two-sum");
      expect(state.assigned.problem.starter_code).toContain("def two_sum");
      expect(state.hints).toEqual([]);
    }

    const s = await driveSubmit(state, "def two_sum(nums, target): return [0,1]", { fetchImpl });
    state = s.state;
    expect(state.phase).toBe("grading");
    if (state.phase === "grading") {
      expect(state.grade.passed).toBe(true);
      expect(state.grade.rubric.correctness).toBe(1.0);
      expect(state.grade.hidden_test_results).toHaveLength(2);
    }

    const f = await driveFinish(state, { fetchImpl });
    state = f.state;
    expect(state.phase).toBe("finished");
    if (state.phase === "finished") {
      expect(state.profile.final_outcome).toBe("passed");
      expect(state.profile.skill_updates).toHaveLength(1);
      expect(state.profile.skill_updates[0]?.next_skill).toBeGreaterThan(
        state.profile.skill_updates[0]?.prev_skill ?? 0,
      );
    }

    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});

describe("session-driver: hint ladder + iteration", () => {
  it("supports request_hint twice (rung 1 then 2) and renders xp_cost from the API response", async () => {
    const fetchImpl = scriptedFetch([
      { urlMatches: "/api/tutor/episodes", status: 201, body: assignBody },
      { urlMatches: `${EPISODE_ID}/hint`, status: 200, body: hint1Body },
      { urlMatches: `${EPISODE_ID}/hint`, status: 200, body: hint2Body },
    ]);

    let state: SessionState = initialSessionState;
    state = (await driveAssign(state, TRACK_ID, { fetchImpl })).state;
    state = (await driveHint(state, 1, { fetchImpl })).state;
    state = (await driveHint(state, 2, { fetchImpl })).state;

    expect(state.phase).toBe("coding");
    if (state.phase === "coding") {
      expect(state.hints).toHaveLength(2);
      expect(state.hints[0]).toEqual(hint1Body);
      expect(state.hints[1]).toEqual(hint2Body);
      // XP cost values come straight from the API — no UI hard-coding.
      expect(state.hints.map((h) => h.xp_cost)).toEqual([5, 15]);
    }
  });

  it("supports submit (failing) → request_hint → submit (passing) → finish", async () => {
    const fetchImpl = scriptedFetch([
      { urlMatches: "/api/tutor/episodes", status: 201, body: assignBody },
      { urlMatches: `${EPISODE_ID}/submit`, status: 200, body: failingGrade },
      { urlMatches: `${EPISODE_ID}/hint`, status: 200, body: hint1Body },
      { urlMatches: `${EPISODE_ID}/submit`, status: 200, body: passingGrade },
      { urlMatches: `${EPISODE_ID}/finish`, status: 200, body: profile },
    ]);

    let state: SessionState = initialSessionState;
    state = (await driveAssign(state, TRACK_ID, { fetchImpl })).state;
    state = (await driveSubmit(state, "x = 1", { fetchImpl })).state;
    expect(state.phase).toBe("grading");
    if (state.phase === "grading") expect(state.grade.passed).toBe(false);

    state = (await driveHint(state, 1, { fetchImpl })).state;
    expect(state.phase).toBe("coding");
    if (state.phase === "coding") expect(state.hints).toHaveLength(1);

    state = (await driveSubmit(state, "x = 2", { fetchImpl })).state;
    expect(state.phase).toBe("grading");
    if (state.phase === "grading") expect(state.grade.passed).toBe(true);

    state = (await driveFinish(state, { fetchImpl })).state;
    expect(state.phase).toBe("finished");
  });
});

describe("session-driver: error paths surface friendly banners (no blank screen)", () => {
  it("assign 429 → error state with the upstream code", async () => {
    const fetchImpl = scriptedFetch([
      {
        urlMatches: "/api/tutor/episodes",
        status: 429,
        body: { error: "daily_budget_exceeded", message: "out of tokens" },
      },
    ]);

    const state: SessionState = (await driveAssign(initialSessionState, TRACK_ID, { fetchImpl }))
      .state;
    expect(state.phase).toBe("error");
    if (state.phase === "error") {
      expect(state.error.status).toBe(429);
      expect(state.error.code).toBe("daily_budget_exceeded");
      expect(state.error.message).toBe("out of tokens");
    }
  });

  it("submit 503 → coding with lastError set (page does not blank)", async () => {
    const fetchImpl = scriptedFetch([
      { urlMatches: "/api/tutor/episodes", status: 201, body: assignBody },
      {
        urlMatches: `${EPISODE_ID}/submit`,
        status: 503,
        body: { error: "service_unavailable" },
      },
    ]);

    let state: SessionState = initialSessionState;
    state = (await driveAssign(state, TRACK_ID, { fetchImpl })).state;
    state = (await driveSubmit(state, "x = 1", { fetchImpl })).state;
    expect(state.phase).toBe("coding");
    if (state.phase === "coding") {
      expect(state.lastError?.status).toBe(503);
    }
  });

  it("finish 409 illegal_transition → sticky error state with previous = finishing", async () => {
    const fetchImpl = scriptedFetch([
      { urlMatches: "/api/tutor/episodes", status: 201, body: assignBody },
      {
        urlMatches: `${EPISODE_ID}/finish`,
        status: 409,
        body: { error: "illegal_transition" },
      },
    ]);

    let state: SessionState = initialSessionState;
    state = (await driveAssign(state, TRACK_ID, { fetchImpl })).state;
    state = (await driveFinish(state, { fetchImpl })).state;
    expect(state.phase).toBe("error");
    if (state.phase === "error") {
      expect(state.error.status).toBe(409);
      expect(state.previous?.phase).toBe("finishing");
    }
  });
});

describe("session-driver: illegal-transition guards", () => {
  it("driveSubmit throws when called from idle (assigning)", async () => {
    await expect(driveSubmit(initialSessionState, "x", {})).rejects.toThrow(/illegal/);
  });

  it("driveHint throws from finished phase", async () => {
    const finished: SessionState = {
      phase: "finished",
      assigned: {
        episode_id: EPISODE_ID,
        problem_id: PROBLEM_ID,
        problem_slug: "two-sum",
        problem: assignBody.problem,
        difficulty_tier: "easy",
        why_this_difficulty: "ok",
        started_at: 1,
      },
      hints: [],
      grade: passingGrade,
      profile,
    };
    await expect(driveHint(finished, 1, {})).rejects.toThrow(/illegal/);
  });
});
