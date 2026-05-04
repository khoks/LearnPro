import { describe, expect, it } from "vitest";
import { IllegalTransitionError } from "./state.js";
import { TutorSession, type TutorSessionTools } from "./tutor-session.js";
import type { AssignProblemOutput } from "./tools/assign-problem.js";
import type { GiveHintOutput } from "./tools/give-hint.js";
import type { GradeOutput } from "./tools/grade.js";
import type { UpdateProfileOutput } from "./tools/update-profile.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const TRACK_ID = "22222222-2222-4222-8222-222222222222";
const EPISODE_ID = "33333333-3333-4333-8333-333333333333";
const PROBLEM_ID = "44444444-4444-4444-8444-444444444444";

interface FakeToolsControl {
  assignOutput: AssignProblemOutput;
  giveHintOutputs: GiveHintOutput[]; // popped in order
  gradeOutputs: GradeOutput[]; // popped in order
  updateProfileOutput: UpdateProfileOutput;
  // Records all calls for assertions.
  calls: { assign: number; hint: number; submit: number; finish: number };
}

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
    rubric: { correctness: passed ? 1 : 0, idiomatic: 0.7, edge_case_coverage: 0.5 },
    prose_explanation: passed ? "ok" : "off-by-one",
    submission_id: "55555555-5555-4555-8555-555555555555",
    runtime_ms: 100,
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
    final_outcome: "passed_with_hints",
    time_to_solve_ms: 60000,
    attempts: 2,
    hints_used: 1,
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
    xp_award: { amount: 5, reason: "episode-passed-with-hints", awarded: true },
  };
}

function fakeTools(control: FakeToolsControl): TutorSessionTools {
  return {
    assignProblem: {
      name: "assignProblem",
      async run() {
        control.calls.assign += 1;
        return control.assignOutput;
      },
    },
    giveHint: {
      name: "giveHint",
      async run() {
        control.calls.hint += 1;
        const next = control.giveHintOutputs.shift();
        if (!next) throw new Error("hint output queue exhausted");
        return next;
      },
    },
    grade: {
      name: "grade",
      async run() {
        control.calls.submit += 1;
        const next = control.gradeOutputs.shift();
        if (!next) throw new Error("grade output queue exhausted");
        return next;
      },
    },
    updateProfile: {
      name: "updateProfile",
      async run() {
        control.calls.finish += 1;
        return control.updateProfileOutput;
      },
    },
  };
}

function makeControl(): FakeToolsControl {
  return {
    assignOutput: fakeAssignOutput(),
    giveHintOutputs: [],
    gradeOutputs: [],
    updateProfileOutput: fakeUpdateProfileOutput(),
    calls: { assign: 0, hint: 0, submit: 0, finish: 0 },
  };
}

function makeSession(opts?: { now?: () => number }): {
  session: TutorSession;
  control: FakeToolsControl;
} {
  const control = makeControl();
  const session = new TutorSession({
    user_id: USER_ID,
    org_id: "self",
    track_id: TRACK_ID,
    tools: fakeTools(control),
    ...(opts?.now !== undefined && { now: opts.now }),
  });
  return { session, control };
}

describe("TutorSession — happy path", () => {
  it("idle → assign → coding → submit (fail) → coding → hint → coding → submit (pass) → grading → finish → done", async () => {
    const { session, control } = makeSession({ now: () => 1700000300000 });
    expect(session.state.phase).toBe("idle");

    const assigned = await session.assign();
    expect(assigned.problem_slug).toBe("two-sum");
    expect(session.state.phase).toBe("coding");

    control.gradeOutputs.push(fakeGradeOutput(false));
    const fail = await session.submit("def solve(): return [0,0]");
    expect(fail.passed).toBe(false);
    expect(session.state.phase).toBe("coding"); // failed → back to coding
    expect(session.state.attempts).toBe(1);

    control.giveHintOutputs.push(fakeHintOutput(1));
    const hint = await session.requestHint(1);
    expect(hint.xp_cost).toBe(5);
    expect(session.state.hints).toHaveLength(1);

    control.gradeOutputs.push(fakeGradeOutput(true));
    const pass = await session.submit("def solve(): return [0,1]");
    expect(pass.passed).toBe(true);
    expect(session.state.phase).toBe("grading");
    expect(session.state.attempts).toBe(2);

    const finished = await session.finish({});
    expect(finished.episode_id).toBe(EPISODE_ID);
    expect(session.state.phase).toBe("done");
    expect(control.calls).toEqual({ assign: 1, hint: 1, submit: 2, finish: 1 });
  });

  it("a clean solve (no hints, no fails) finishes with final_outcome=passed", async () => {
    const { session, control } = makeSession();
    await session.assign();
    control.gradeOutputs.push(fakeGradeOutput(true));
    await session.submit("def solve(): return [0,1]");
    await session.finish({});
    expect(control.calls.finish).toBe(1);
    if (session.state.phase !== "done") throw new Error("expected done");
    expect(session.state.final_outcome).toBe("passed");
  });

  it("can re-assign after done (legal transition done → assigned)", async () => {
    const { session, control } = makeSession();
    await session.assign();
    control.gradeOutputs.push(fakeGradeOutput(true));
    await session.submit("def solve(): return [0,1]");
    await session.finish({});
    expect(session.state.phase).toBe("done");
    await session.assign();
    expect(session.state.phase).toBe("coding");
    expect(control.calls.assign).toBe(2);
  });
});

describe("TutorSession — illegal transitions", () => {
  it("requestHint from idle is illegal", async () => {
    const { session } = makeSession();
    await expect(session.requestHint(1)).rejects.toBeInstanceOf(IllegalTransitionError);
  });

  it("requestHint from grading is illegal", async () => {
    const { session, control } = makeSession();
    await session.assign();
    control.gradeOutputs.push(fakeGradeOutput(true));
    await session.submit("x");
    expect(session.state.phase).toBe("grading");
    await expect(session.requestHint(1)).rejects.toBeInstanceOf(IllegalTransitionError);
  });

  it("submit from idle is illegal", async () => {
    const { session } = makeSession();
    await expect(session.submit("x")).rejects.toBeInstanceOf(IllegalTransitionError);
  });

  it("finish from idle is illegal", async () => {
    const { session } = makeSession();
    await expect(session.finish({})).rejects.toBeInstanceOf(IllegalTransitionError);
  });

  it("finish from done is illegal (must assign a new problem first)", async () => {
    const { session, control } = makeSession();
    await session.assign();
    control.gradeOutputs.push(fakeGradeOutput(true));
    await session.submit("x");
    await session.finish({});
    await expect(session.finish({})).rejects.toBeInstanceOf(IllegalTransitionError);
  });

  it("assign from coding is illegal — must finish or abandon first", async () => {
    const { session } = makeSession();
    await session.assign();
    expect(session.state.phase).toBe("coding");
    await expect(session.assign()).rejects.toBeInstanceOf(IllegalTransitionError);
  });
});

describe("TutorSession — abandoned outcome", () => {
  it("abandoned from coding is allowed (user gives up before submitting)", async () => {
    const { session, control } = makeSession();
    await session.assign();
    expect(session.state.phase).toBe("coding");
    await session.finish({ outcome: "abandoned" });
    expect(control.calls.finish).toBe(1);
    if (session.state.phase !== "done") throw new Error("expected done");
    expect(session.state.final_outcome).toBe("abandoned");
  });

  it("abandoned from idle is illegal", async () => {
    const { session } = makeSession();
    await expect(session.finish({ outcome: "abandoned" })).rejects.toBeInstanceOf(
      IllegalTransitionError,
    );
  });
});
