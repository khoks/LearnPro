import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  TutorSession,
  type AssignProblemInput,
  type AssignProblemOutput,
  type AssignProblemTool,
  type FinalOutcome,
  type GiveHintInput,
  type GiveHintOutput,
  type GiveHintTool,
  type GradeInput,
  type GradeOutput,
  type GradeTool,
  type HintRung,
  type TutorSessionTools,
  type UpdateProfileInput,
  type UpdateProfileOutput,
  type UpdateProfileTool,
} from "./index.js";

// Eval-harness replay (STORY-011 AC #5). Loads a recorded transcript fixture, plays it through
// TutorSession with canned outputs, and asserts the final state matches the fixture exactly.
//
// The fixture is the source of truth — if you change the state machine semantics in a way that
// breaks an existing transcript, you MUST update the fixture and explain why in the PR.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.resolve(HERE, "..", "test", "fixtures");

interface ReplayFixture {
  name: string;
  description: string;
  user_id: string;
  org_id: string;
  track_id: string;
  now_ms: number;
  assign_problem: {
    input: AssignProblemInput;
    output: AssignProblemOutput;
  };
  steps: ReplayStep[];
  final_state: {
    phase: "done";
    episode_id: string;
    problem_slug: string;
    attempts: number;
    hints_count: number;
    final_outcome: FinalOutcome;
  };
}

type ReplayStep =
  | { kind: "submit"; code: string; grade_output: GradeOutput }
  | { kind: "hint"; rung: HintRung; give_hint_output: GiveHintOutput }
  | {
      kind: "finish";
      args: { outcome?: FinalOutcome; reveal_clicked?: boolean };
      update_profile_output: UpdateProfileOutput;
    };

function loadFixture(name: string): ReplayFixture {
  const file = path.join(FIXTURES_DIR, `${name}.json`);
  const raw = readFileSync(file, "utf8");
  return JSON.parse(raw) as ReplayFixture;
}

// Each canned tool returns the next queued output and asserts the input matches. Mismatches surface
// as test failures so the fixture stays grounded against the live state machine.
function buildCannedTools(fixture: ReplayFixture): {
  tools: TutorSessionTools;
  recorded: { kind: string; input: unknown; output: unknown }[];
} {
  const recorded: { kind: string; input: unknown; output: unknown }[] = [];

  const submitOutputs = fixture.steps
    .filter((s): s is Extract<ReplayStep, { kind: "submit" }> => s.kind === "submit")
    .map((s) => s.grade_output);
  const hintOutputs = fixture.steps
    .filter((s): s is Extract<ReplayStep, { kind: "hint" }> => s.kind === "hint")
    .map((s) => s.give_hint_output);
  const finishStep = fixture.steps.find(
    (s): s is Extract<ReplayStep, { kind: "finish" }> => s.kind === "finish",
  );
  if (!finishStep) throw new Error("fixture missing a finish step");

  const submitQueue = [...submitOutputs];
  const hintQueue = [...hintOutputs];

  const assignProblem: AssignProblemTool = {
    name: "assignProblem",
    async run(input) {
      recorded.push({ kind: "assign", input, output: fixture.assign_problem.output });
      return fixture.assign_problem.output;
    },
  };
  const giveHint: GiveHintTool = {
    name: "giveHint",
    async run(input: GiveHintInput) {
      const next = hintQueue.shift();
      if (!next) throw new Error("hint queue exhausted");
      recorded.push({ kind: "hint", input, output: next });
      return next;
    },
  };
  const grade: GradeTool = {
    name: "grade",
    async run(input: GradeInput) {
      const next = submitQueue.shift();
      if (!next) throw new Error("submit queue exhausted");
      recorded.push({ kind: "submit", input, output: next });
      return next;
    },
  };
  const updateProfile: UpdateProfileTool = {
    name: "updateProfile",
    async run(input: UpdateProfileInput) {
      recorded.push({
        kind: "finish",
        input,
        output: finishStep.update_profile_output,
      });
      return finishStep.update_profile_output;
    },
  };

  return {
    tools: { assignProblem, giveHint, grade, updateProfile },
    recorded,
  };
}

describe("replay-001 (STORY-011 AC #5)", () => {
  it("plays the recorded transcript end-to-end and converges to the fixture's final_state", async () => {
    const fixture = loadFixture("replay-001");
    const { tools, recorded } = buildCannedTools(fixture);

    const session = new TutorSession({
      user_id: fixture.user_id,
      org_id: fixture.org_id,
      track_id: fixture.track_id,
      tools,
      now: () => fixture.now_ms,
    });

    expect(session.state.phase).toBe("idle");

    // 1. assign
    const assigned = await session.assign();
    expect(assigned.problem_slug).toBe(fixture.assign_problem.output.problem_slug);
    expect(session.state.phase).toBe("coding");

    // 2..N. play the recorded steps.
    for (const step of fixture.steps) {
      switch (step.kind) {
        case "submit": {
          const out = await session.submit(step.code);
          expect(out.passed).toBe(step.grade_output.passed);
          expect(out.submission_id).toBe(step.grade_output.submission_id);
          break;
        }
        case "hint": {
          const out = await session.requestHint(step.rung);
          expect(out.rung).toBe(step.rung);
          expect(out.xp_cost).toBe(step.give_hint_output.xp_cost);
          break;
        }
        case "finish": {
          const out = await session.finish(step.args);
          expect(out.episode_id).toBe(step.update_profile_output.episode_id);
          expect(out.final_outcome).toBe(step.update_profile_output.final_outcome);
          expect(out.skill_updates).toEqual(step.update_profile_output.skill_updates);
          break;
        }
      }
    }

    // Final state assertions match the fixture exactly.
    if (session.state.phase !== "done") {
      throw new Error(`expected final phase=done, got ${session.state.phase}`);
    }
    expect(session.state.episode_id).toBe(fixture.final_state.episode_id);
    expect(session.state.problem_slug).toBe(fixture.final_state.problem_slug);
    expect(session.state.attempts).toBe(fixture.final_state.attempts);
    expect(session.state.hints.length).toBe(fixture.final_state.hints_count);
    expect(session.state.final_outcome).toBe(fixture.final_state.final_outcome);

    // Recorded tool calls come in the expected order: assign → submit → hint → submit → hint → submit → finish.
    expect(recorded.map((r) => r.kind)).toEqual([
      "assign",
      "submit",
      "hint",
      "submit",
      "hint",
      "submit",
      "finish",
    ]);
  });

  it("the tool-call signature on the finish step reflects the live hints/attempts (not zeros)", async () => {
    const fixture = loadFixture("replay-001");
    const { tools, recorded } = buildCannedTools(fixture);

    const session = new TutorSession({
      user_id: fixture.user_id,
      org_id: fixture.org_id,
      track_id: fixture.track_id,
      tools,
      now: () => fixture.now_ms,
    });

    await session.assign();
    for (const step of fixture.steps) {
      if (step.kind === "submit") await session.submit(step.code);
      else if (step.kind === "hint") await session.requestHint(step.rung);
      else await session.finish(step.args);
    }

    const finishCall = recorded.find((r) => r.kind === "finish");
    expect(finishCall, "no finish call recorded").toBeDefined();
    const finishInput = finishCall!.input as UpdateProfileInput;
    // 3 submits, 2 hints — the state machine must propagate these into the updateProfile call so
    // the persistence layer writes the correct counts to `episodes`.
    expect(finishInput.submit_count).toBe(3);
    expect(finishInput.hints_used).toBe(2);
    expect(finishInput.finished_at_ms).toBe(fixture.now_ms);
  });
});
