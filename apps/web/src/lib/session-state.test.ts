import type { AssignProblemOutput, GradeOutput, UpdateProfileOutput } from "@learnpro/agent";
import { describe, expect, it } from "vitest";
import {
  friendlyError,
  IllegalSessionEventError,
  initialSessionState,
  nextHintRung,
  transition,
  type AssignedProblem,
  type HintEntry,
  type SessionEvent,
  type SessionState,
} from "./session-state";

const problem: AssignProblemOutput["problem"] = {
  name: "Two Sum",
  language: "python",
  statement: "Find two numbers that add up to target.",
  starter_code: "def two_sum(nums, target):\n    pass\n",
  public_examples: [],
  expected_median_time_to_solve_ms: 600_000,
  concept_tags: ["arrays", "hashing"],
  difficulty: 2,
};

const assigned: AssignedProblem = {
  episode_id: "11111111-1111-4111-8111-111111111111",
  problem_id: "22222222-2222-4222-8222-222222222222",
  problem_slug: "two-sum",
  problem,
  difficulty_tier: "easy",
  why_this_difficulty: "cold-start: starting at easy",
  started_at: 1_700_000_000_000,
};

const hint1: HintEntry = { rung: 1, hint: "Think about pairs.", xp_cost: 5 };
const hint2: HintEntry = { rung: 2, hint: "Use a hashmap.", xp_cost: 15 };
const hint3: HintEntry = { rung: 3, hint: "Here's a skeleton…", xp_cost: 30 };

const passingGrade: GradeOutput = {
  passed: true,
  hidden_test_results: [
    { index: 0, passed: true },
    { index: 1, passed: true },
  ],
  rubric: { correctness: 1.0, idiomatic: 0.85, edge_case_coverage: 0.9 },
  prose_explanation: "Clean solution.",
  submission_id: "33333333-3333-4333-8333-333333333333",
  runtime_ms: 12,
};

const failingGrade: GradeOutput = {
  passed: false,
  hidden_test_results: [
    { index: 0, passed: false, expected: 3, got: 2 },
    { index: 1, passed: true },
  ],
  rubric: { correctness: 0.5, idiomatic: 0.4, edge_case_coverage: 0.3 },
  prose_explanation: "Off-by-one in the loop.",
  submission_id: "44444444-4444-4444-8444-444444444444",
  runtime_ms: 8,
};

const profile: UpdateProfileOutput = {
  episode_id: assigned.episode_id,
  final_outcome: "passed",
  time_to_solve_ms: 480_000,
  attempts: 1,
  hints_used: 0,
  skill_updates: [
    {
      concept_id: "55555555-5555-4555-8555-555555555555",
      concept_slug: "arrays",
      prev_skill: 0.5,
      next_skill: 0.62,
      next_confidence: 0.4,
      attempts: 1,
    },
  ],
};

function codingState(opts?: {
  hints?: HintEntry[];
  lastGrade?: GradeOutput | null;
}): Extract<SessionState, { phase: "coding" }> {
  return {
    phase: "coding",
    assigned,
    hints: opts?.hints ?? [],
    lastGrade: opts?.lastGrade ?? null,
    lastError: null,
  };
}

describe("initialSessionState", () => {
  it("starts in the assigning phase", () => {
    expect(initialSessionState.phase).toBe("assigning");
  });
});

describe("transition: assigning", () => {
  it("assign_started is a no-op while already assigning", () => {
    const next = transition({ phase: "assigning" }, { type: "assign_started" });
    expect(next).toEqual({ phase: "assigning" });
  });

  it("assign_succeeded → coding with hints=[] / lastGrade=null", () => {
    const next = transition({ phase: "assigning" }, { type: "assign_succeeded", assigned });
    expect(next.phase).toBe("coding");
    if (next.phase === "coding") {
      expect(next.assigned).toBe(assigned);
      expect(next.hints).toEqual([]);
      expect(next.lastGrade).toBeNull();
    }
  });

  it("assign_failed → error with no previous", () => {
    const error = friendlyError(429, { error: "daily_budget_exceeded" });
    const next = transition({ phase: "assigning" }, { type: "assign_failed", error });
    expect(next.phase).toBe("error");
    if (next.phase === "error") {
      expect(next.error).toBe(error);
      expect(next.previous).toBeNull();
    }
  });

  for (const illegal of ["request_hint", "submit", "finish", "submit_succeeded"] as const) {
    it(`rejects ${illegal} during assigning`, () => {
      const ev = stubEvent(illegal);
      expect(() => transition({ phase: "assigning" }, ev)).toThrow(IllegalSessionEventError);
    });
  }
});

describe("transition: coding", () => {
  it("request_hint → hint_loading", () => {
    const next = transition(codingState(), { type: "request_hint", rung: 1 });
    expect(next.phase).toBe("hint_loading");
    if (next.phase === "hint_loading") {
      expect(next.requestedRung).toBe(1);
      expect(next.hints).toEqual([]);
    }
  });

  it("submit → submitting carries the code through", () => {
    const next = transition(codingState(), { type: "submit", code: "x = 1" });
    expect(next.phase).toBe("submitting");
    if (next.phase === "submitting") {
      expect(next.submittedCode).toBe("x = 1");
    }
  });

  it("finish → finishing", () => {
    const next = transition(codingState(), { type: "finish" });
    expect(next.phase).toBe("finishing");
  });

  it("finish carries lastGrade through", () => {
    const next = transition(codingState({ lastGrade: failingGrade }), { type: "finish" });
    if (next.phase === "finishing") {
      expect(next.grade).toBe(failingGrade);
    }
  });

  it("rejects request_hint after rung 3 already used", () => {
    expect(() =>
      transition(codingState({ hints: [hint1, hint2, hint3] }), {
        type: "request_hint",
        rung: 3,
      }),
    ).toThrow(IllegalSessionEventError);
  });

  for (const illegal of ["assign_succeeded", "hint_succeeded", "submit_succeeded"] as const) {
    it(`rejects ${illegal} during coding`, () => {
      const ev = stubEvent(illegal);
      expect(() => transition(codingState(), ev)).toThrow(IllegalSessionEventError);
    });
  }
});

describe("transition: hint_loading", () => {
  const start = (): SessionState => ({
    phase: "hint_loading",
    assigned,
    hints: [],
    lastGrade: null,
    requestedRung: 1,
  });

  it("hint_succeeded → coding with hint appended", () => {
    const next = transition(start(), { type: "hint_succeeded", hint: hint1 });
    expect(next.phase).toBe("coding");
    if (next.phase === "coding") {
      expect(next.hints).toEqual([hint1]);
      expect(next.lastError).toBeNull();
    }
  });

  it("hint_failed → coding with lastError set", () => {
    const error = friendlyError(503, { error: "service_unavailable" });
    const next = transition(start(), { type: "hint_failed", error });
    expect(next.phase).toBe("coding");
    if (next.phase === "coding") {
      expect(next.hints).toEqual([]);
      expect(next.lastError).toBe(error);
    }
  });

  it("rejects request_hint while already loading a hint", () => {
    expect(() => transition(start(), { type: "request_hint", rung: 2 })).toThrow(
      IllegalSessionEventError,
    );
  });
});

describe("transition: submitting", () => {
  const start = (): SessionState => ({
    phase: "submitting",
    assigned,
    hints: [],
    lastGrade: null,
    submittedCode: "x = 1",
  });

  it("submit_succeeded → grading", () => {
    const next = transition(start(), { type: "submit_succeeded", grade: passingGrade });
    expect(next.phase).toBe("grading");
    if (next.phase === "grading") {
      expect(next.grade).toBe(passingGrade);
    }
  });

  it("submit_failed → coding with lastError set", () => {
    const error = friendlyError(429, { error: "daily_budget_exceeded" });
    const next = transition(start(), { type: "submit_failed", error });
    expect(next.phase).toBe("coding");
    if (next.phase === "coding") {
      expect(next.lastError).toBe(error);
    }
  });

  it("rejects submit while already submitting", () => {
    expect(() => transition(start(), { type: "submit", code: "y = 2" })).toThrow(
      IllegalSessionEventError,
    );
  });
});

describe("transition: grading", () => {
  const start = (overrides?: { hints?: HintEntry[] }): SessionState => ({
    phase: "grading",
    assigned,
    hints: overrides?.hints ?? [],
    grade: failingGrade,
  });

  it("submit → submitting again (carries grade as lastGrade)", () => {
    const next = transition(start(), { type: "submit", code: "x = 2" });
    expect(next.phase).toBe("submitting");
    if (next.phase === "submitting") {
      expect(next.lastGrade).toBe(failingGrade);
    }
  });

  it("request_hint → hint_loading carries the grade through as lastGrade", () => {
    const next = transition(start({ hints: [hint1] }), { type: "request_hint", rung: 2 });
    expect(next.phase).toBe("hint_loading");
    if (next.phase === "hint_loading") {
      expect(next.lastGrade).toBe(failingGrade);
      expect(next.requestedRung).toBe(2);
    }
  });

  it("finish → finishing", () => {
    const next = transition(start(), { type: "finish" });
    expect(next.phase).toBe("finishing");
    if (next.phase === "finishing") {
      expect(next.grade).toBe(failingGrade);
    }
  });

  it("rejects request_hint after rung 3 used", () => {
    expect(() =>
      transition(start({ hints: [hint1, hint2, hint3] }), { type: "request_hint", rung: 3 }),
    ).toThrow(IllegalSessionEventError);
  });

  for (const illegal of ["assign_succeeded", "hint_succeeded", "finish_succeeded"] as const) {
    it(`rejects ${illegal} during grading`, () => {
      const ev = stubEvent(illegal);
      expect(() => transition(start(), ev)).toThrow(IllegalSessionEventError);
    });
  }
});

describe("transition: finishing", () => {
  const start = (): SessionState => ({
    phase: "finishing",
    assigned,
    hints: [],
    grade: passingGrade,
  });

  it("finish_succeeded → finished with profile", () => {
    const next = transition(start(), { type: "finish_succeeded", profile });
    expect(next.phase).toBe("finished");
    if (next.phase === "finished") {
      expect(next.profile).toBe(profile);
      expect(next.grade).toBe(passingGrade);
    }
  });

  it("finish_failed → error with previous = the finishing state", () => {
    const error = friendlyError(503, { error: "service_unavailable" });
    const next = transition(start(), { type: "finish_failed", error });
    expect(next.phase).toBe("error");
    if (next.phase === "error") {
      expect(next.error).toBe(error);
      expect(next.previous?.phase).toBe("finishing");
    }
  });
});

describe("transition: finished (terminal)", () => {
  const start = (): SessionState => ({
    phase: "finished",
    assigned,
    hints: [],
    grade: passingGrade,
    profile,
  });

  it("rejects every non-reset event", () => {
    for (const illegal of ["request_hint", "submit", "finish", "assign_succeeded"] as const) {
      const ev = stubEvent(illegal);
      expect(() => transition(start(), ev)).toThrow(IllegalSessionEventError);
    }
  });

  it("reset → assigning (next problem)", () => {
    const next = transition(start(), { type: "reset" });
    expect(next.phase).toBe("assigning");
  });
});

describe("transition: error sticky", () => {
  it("dismiss_error pops back to the previous state if any", () => {
    const previous = codingState();
    const errorState: SessionState = {
      phase: "error",
      error: friendlyError(503, {}),
      previous,
    };
    const next = transition(errorState, { type: "dismiss_error" });
    expect(next).toBe(previous);
  });

  it("dismiss_error → assigning when there is no previous", () => {
    const errorState: SessionState = {
      phase: "error",
      error: friendlyError(429, { error: "daily_budget_exceeded" }),
      previous: null,
    };
    const next = transition(errorState, { type: "dismiss_error" });
    expect(next.phase).toBe("assigning");
  });

  it("rejects every other event", () => {
    const errorState: SessionState = {
      phase: "error",
      error: friendlyError(429, {}),
      previous: null,
    };
    for (const illegal of ["request_hint", "submit", "finish"] as const) {
      const ev = stubEvent(illegal);
      expect(() => transition(errorState, ev)).toThrow(IllegalSessionEventError);
    }
  });
});

describe("dismiss_error / reset on non-error states", () => {
  it("dismiss_error is a no-op on non-error states", () => {
    const s = codingState();
    expect(transition(s, { type: "dismiss_error" })).toBe(s);
  });

  it("reset always returns to assigning", () => {
    const s = codingState({ hints: [hint1] });
    expect(transition(s, { type: "reset" }).phase).toBe("assigning");
  });
});

describe("nextHintRung", () => {
  it("returns 1 / 2 / 3 / null based on hints already given", () => {
    expect(nextHintRung([])).toBe(1);
    expect(nextHintRung([hint1])).toBe(2);
    expect(nextHintRung([hint1, hint2])).toBe(3);
    expect(nextHintRung([hint1, hint2, hint3])).toBeNull();
  });
});

describe("friendlyError", () => {
  it("uses the upstream message when available", () => {
    const e = friendlyError(429, { error: "daily_budget_exceeded", message: "out of tokens" });
    expect(e.message).toBe("out of tokens");
    expect(e.code).toBe("daily_budget_exceeded");
  });

  it("falls back to a friendly default per status code", () => {
    expect(friendlyError(401, {}).message.toLowerCase()).toContain("session");
    expect(friendlyError(429, {}).message.toLowerCase()).toContain("budget");
    expect(friendlyError(503, {}).message.toLowerCase()).toContain("unavailable");
    expect(friendlyError(409, {}).message.toLowerCase()).toContain("step");
    expect(friendlyError(404, { error: "no_eligible_problem" }).message.toLowerCase()).toContain(
      "track",
    );
  });
});

// Builds a valid SessionEvent purely for negative-path checks. We never read the payload past
// the type discriminator, so the placeholders are safe.
function stubEvent(type: SessionEvent["type"]): SessionEvent {
  switch (type) {
    case "request_hint":
      return { type: "request_hint", rung: 1 };
    case "submit":
      return { type: "submit", code: "x" };
    case "submit_succeeded":
      return { type: "submit_succeeded", grade: passingGrade };
    case "submit_failed":
      return { type: "submit_failed", error: friendlyError(503, {}) };
    case "hint_succeeded":
      return { type: "hint_succeeded", hint: hint1 };
    case "hint_failed":
      return { type: "hint_failed", error: friendlyError(503, {}) };
    case "assign_started":
      return { type: "assign_started" };
    case "assign_succeeded":
      return { type: "assign_succeeded", assigned };
    case "assign_failed":
      return { type: "assign_failed", error: friendlyError(503, {}) };
    case "finish":
      return { type: "finish" };
    case "finish_succeeded":
      return { type: "finish_succeeded", profile };
    case "finish_failed":
      return { type: "finish_failed", error: friendlyError(503, {}) };
    case "dismiss_error":
      return { type: "dismiss_error" };
    case "reset":
      return { type: "reset" };
  }
}
