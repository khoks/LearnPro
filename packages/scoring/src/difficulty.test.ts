import { describe, expect, it } from "vitest";
import {
  DEFAULT_DIFFICULTY_HEURISTIC,
  difficultySignal,
  episodeSuccessScore,
  nextDifficulty,
  updateSkillScore,
  type EpisodeSignalInput,
} from "./difficulty.js";
import type { ConceptSkill } from "./policies/types.js";

function ep(overrides: Partial<EpisodeSignalInput> = {}): EpisodeSignalInput {
  return {
    passed: true,
    reveal_clicked: false,
    hints_used: 0,
    submit_count: 1,
    time_to_solve_ms: 60_000,
    expected_time_ms: 120_000,
    ...overrides,
  };
}

function skill(overrides: Partial<ConceptSkill> = {}): ConceptSkill {
  return { concept_id: "list-comp", skill: 0.5, confidence: 0.3, attempts: 5, ...overrides };
}

describe("difficultySignal", () => {
  it("returns +correctness_bonus for a perfect under-time solve", () => {
    const s = difficultySignal(ep({ time_to_solve_ms: 60_000 }));
    expect(s).toBeCloseTo(DEFAULT_DIFFICULTY_HEURISTIC.correctness_bonus, 6);
  });

  it("clamps overtime contribution at the configured cap (no runaway negative signal)", () => {
    const huge = difficultySignal(ep({ time_to_solve_ms: 1_000_000_000, passed: false }));
    // overtime clamped to 1 → -0.5 contribution from overtime, no other contributions
    expect(huge).toBe(-0.5);
  });

  it("clamps hints contribution at the configured cap", () => {
    const s = difficultySignal(ep({ hints_used: 999, time_to_solve_ms: 60_000, passed: false }));
    // hints clamped to 1 → -0.3, no overtime, no fails, no correctness
    expect(s).toBe(-0.3);
  });
});

describe("nextDifficulty", () => {
  it("perfect solve: easy → medium (step up)", () => {
    const next = nextDifficulty("easy", ep({ time_to_solve_ms: 30_000 }));
    expect(next).toBe("medium");
  });

  it("hint-heavy solve: same difficulty (no step in either direction)", () => {
    const next = nextDifficulty(
      "medium",
      ep({ hints_used: 2, submit_count: 2, time_to_solve_ms: 100_000 }),
    );
    expect(next).toBe("medium");
  });

  it("repeated failures (heavy struggle, didn't pass): hard → medium (step down)", () => {
    const next = nextDifficulty(
      "hard",
      ep({
        passed: false,
        submit_count: 4,
        hints_used: 2,
        time_to_solve_ms: 200_000,
      }),
    );
    expect(next).toBe("medium");
  });

  it("massive overtime (~3× expected) on a passed solve still steps down", () => {
    const next = nextDifficulty(
      "medium",
      ep({ time_to_solve_ms: 360_000, hints_used: 1, submit_count: 2 }),
    );
    expect(next).toBe("easy");
  });

  it("under-time clean solve at expert stays expert (cap at top of ladder)", () => {
    const next = nextDifficulty("expert", ep({ time_to_solve_ms: 30_000 }));
    expect(next).toBe("expert");
  });

  it("no-progress (failed, max hints, max retries, way overtime) at easy stays easy (cap at bottom)", () => {
    const next = nextDifficulty(
      "easy",
      ep({
        passed: false,
        hints_used: 3,
        submit_count: 5,
        time_to_solve_ms: 240_000,
        reveal_clicked: true,
      }),
    );
    expect(next).toBe("easy");
  });

  it("respects an operator-injected stricter step_up_threshold (no step up on a perfect solve)", () => {
    const next = nextDifficulty("medium", ep({ time_to_solve_ms: 30_000 }), {
      ...DEFAULT_DIFFICULTY_HEURISTIC,
      step_up_threshold: 0.5,
    });
    expect(next).toBe("medium");
  });
});

describe("episodeSuccessScore", () => {
  it("clean solve = 1", () => {
    expect(episodeSuccessScore(ep())).toBe(1);
  });

  it("revealed solution = 0 even if 'passed' is true", () => {
    expect(episodeSuccessScore(ep({ reveal_clicked: true }))).toBe(0);
  });

  it("failed = 0", () => {
    expect(episodeSuccessScore(ep({ passed: false }))).toBe(0);
  });

  it("hints + retries shave the score down (still positive)", () => {
    const s = episodeSuccessScore(ep({ hints_used: 1, submit_count: 2 }));
    // 1 - 1*0.15 (hint) - 1*0.10 (1 retry) = 0.75
    expect(s).toBeCloseTo(0.75, 6);
  });

  it("excessive hints/retries floor at 0 (never negative)", () => {
    const s = episodeSuccessScore(ep({ hints_used: 99, submit_count: 99 }));
    expect(s).toBe(0);
  });
});

describe("updateSkillScore", () => {
  it("EWMA pulls skill toward 1 on a clean solve", () => {
    const next = updateSkillScore(skill({ skill: 0.5 }), ep());
    // 0.4 * 1 + 0.6 * 0.5 = 0.7
    expect(next.skill).toBeCloseTo(0.7, 6);
    expect(next.attempts).toBe(6);
  });

  it("EWMA pulls skill toward 0 on a failed solve", () => {
    const next = updateSkillScore(skill({ skill: 0.5 }), ep({ passed: false }));
    // 0.4 * 0 + 0.6 * 0.5 = 0.3
    expect(next.skill).toBeCloseTo(0.3, 6);
  });

  it("confidence grows asymptotically toward confidence_max", () => {
    let s = skill({ confidence: 0 });
    for (let i = 0; i < 100; i++) s = updateSkillScore(s, ep());
    expect(s.confidence).toBeGreaterThan(0.94);
    expect(s.confidence).toBeLessThanOrEqual(0.95);
  });

  it("clamps skill into [0, 1] (defensive — formula already keeps it bounded)", () => {
    const next = updateSkillScore(skill({ skill: 1 }), ep());
    expect(next.skill).toBeLessThanOrEqual(1);
    expect(next.skill).toBeGreaterThanOrEqual(0);
  });

  it("preserves the concept_id of the previous record", () => {
    const next = updateSkillScore(skill({ concept_id: "dict-comp" }), ep());
    expect(next.concept_id).toBe("dict-comp");
  });
});
