import { describe, expect, it } from "vitest";
import {
  DEFAULT_COMPREHENSION_HEURISTIC,
  DEFAULT_DIFFICULTY_HEURISTIC,
  comprehensionDifficultySignal,
  comprehensionEpisodeSuccessScore,
  difficultySignal,
  episodeSuccessScore,
  nextComprehensionDifficulty,
  nextDifficulty,
  updateSkillScore,
  type ComprehensionEpisodeSignalInput,
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

  // STORY-042 — anti-cheat v1: when the user marked the submission as "I got help on this one",
  // the EWMA + confidence + attempts must all be left unchanged. The submission was still graded
  // and XP still awarded; we just don't reward concept mastery for code that wasn't theirs.
  it("got_help=true returns prev unchanged (no skill bump on a clean solve)", () => {
    const prev = skill({ skill: 0.5, confidence: 0.3, attempts: 5 });
    const next = updateSkillScore(prev, ep({ got_help: true }));
    expect(next).toEqual(prev);
  });

  it("got_help=true does not advance attempts even on a failing submission", () => {
    const prev = skill({ skill: 0.4, confidence: 0.2, attempts: 3 });
    const next = updateSkillScore(prev, ep({ passed: false, got_help: true }));
    expect(next).toEqual(prev);
  });

  it("got_help=false (default) preserves the original behaviour", () => {
    const prev = skill({ skill: 0.5, confidence: 0.3, attempts: 5 });
    const next = updateSkillScore(prev, ep({ got_help: false }));
    expect(next.skill).toBeCloseTo(0.7, 6);
    expect(next.attempts).toBe(6);
  });
});

// STORY-038b — comprehension difficulty calibration. The implement/debug heuristic above is
// keyed off tests_passed/total, hidden_tests, time_to_solve, hints. Comprehension episodes have
// none of those — multiple_choice is binary, free_text is rubric 1-5, no hidden tests. The
// helpers below are the comprehension-axis equivalent. The implement/debug branch stays
// byte-for-byte the same (regression test at the bottom).
function compMc(
  overrides: Partial<Extract<ComprehensionEpisodeSignalInput, { comprehension_format: "multiple_choice" }>> = {},
): ComprehensionEpisodeSignalInput {
  return {
    comprehension_format: "multiple_choice",
    correct: true,
    time_to_answer_sec: 30,
    attempt_count: 1,
    hint_count: 0,
    ...overrides,
  };
}

function compFt(
  overrides: Partial<Extract<ComprehensionEpisodeSignalInput, { comprehension_format: "free_text" }>> = {},
): ComprehensionEpisodeSignalInput {
  return {
    comprehension_format: "free_text",
    rubric_score: 5,
    time_to_answer_sec: 90,
    attempt_count: 1,
    hint_count: 0,
    ...overrides,
  };
}

describe("comprehension difficulty: comprehensionEpisodeSuccessScore", () => {
  it("multiple_choice correct on first try (no hints, single attempt) = 1.0", () => {
    expect(comprehensionEpisodeSuccessScore(compMc())).toBe(1.0);
  });

  it("multiple_choice correct after 1 hint = 0.6", () => {
    expect(comprehensionEpisodeSuccessScore(compMc({ hint_count: 1 }))).toBe(0.6);
  });

  it("multiple_choice correct after 2 attempts (no hints) = 0.6", () => {
    expect(comprehensionEpisodeSuccessScore(compMc({ attempt_count: 2 }))).toBe(0.6);
  });

  it("multiple_choice correct after 2+ hints = 0.3", () => {
    expect(comprehensionEpisodeSuccessScore(compMc({ hint_count: 2 }))).toBe(0.3);
  });

  it("multiple_choice correct after 3+ attempts = 0.3", () => {
    expect(comprehensionEpisodeSuccessScore(compMc({ attempt_count: 3 }))).toBe(0.3);
  });

  it("multiple_choice incorrect = 0.0", () => {
    expect(comprehensionEpisodeSuccessScore(compMc({ correct: false }))).toBe(0.0);
  });

  it("free_text rubric=5 = 1.0", () => {
    expect(comprehensionEpisodeSuccessScore(compFt({ rubric_score: 5 }))).toBe(1.0);
  });

  it("free_text rubric=3 = 0.5", () => {
    expect(comprehensionEpisodeSuccessScore(compFt({ rubric_score: 3 }))).toBe(0.5);
  });

  it("free_text rubric=1 = 0.0", () => {
    expect(comprehensionEpisodeSuccessScore(compFt({ rubric_score: 1 }))).toBe(0.0);
  });

  it("free_text rubric=2 = 0.25", () => {
    expect(comprehensionEpisodeSuccessScore(compFt({ rubric_score: 2 }))).toBe(0.25);
  });
});

describe("comprehension difficulty: comprehensionDifficultySignal", () => {
  it("multiple_choice correct on first try, under-time → positive signal (step-up territory)", () => {
    const s = comprehensionDifficultySignal(compMc({ time_to_answer_sec: 30 }));
    // success ≥ 0.6 and hint_count=0 → +correctness_bonus = +0.3 (no other contributions)
    expect(s).toBeCloseTo(DEFAULT_COMPREHENSION_HEURISTIC.correctness_bonus, 6);
  });

  it("multiple_choice incorrect, slow + multiple hints → negative signal (step-down territory)", () => {
    const s = comprehensionDifficultySignal(
      compMc({
        correct: false,
        time_to_answer_sec: 240,
        attempt_count: 4,
        hint_count: 3,
      }),
    );
    // overtime clamped to 1 → -0.5; hints clamped to 1 → -0.3; failed_attempts (3/4) → -0.15.
    // success<0.6 so no correctness bonus. Total ≈ -0.95.
    expect(s).toBeLessThan(-0.3);
  });

  it("free_text rubric=5 fast → positive signal", () => {
    const s = comprehensionDifficultySignal(compFt({ rubric_score: 5, time_to_answer_sec: 60 }));
    expect(s).toBeCloseTo(0.3, 6);
  });

  it("free_text rubric=2 slow + 2 hints → negative signal", () => {
    const s = comprehensionDifficultySignal(
      compFt({ rubric_score: 2, time_to_answer_sec: 600, attempt_count: 2, hint_count: 2 }),
    );
    expect(s).toBeLessThan(-0.3);
  });

  it("free_text rubric=3 + average time + no hints → near-zero signal (no step)", () => {
    const s = comprehensionDifficultySignal(
      compFt({ rubric_score: 3, time_to_answer_sec: 180, attempt_count: 1, hint_count: 0 }),
    );
    // success=0.5 (<0.6) so no correctness bonus; overtime ratio=1 → 0 contribution; no hints, no
    // failed attempts. s = 0.
    expect(s).toBeCloseTo(0, 6);
  });

  it("uses per-problem expected_time_sec when supplied (overrides default)", () => {
    // Default for multiple_choice is 60s; pass 30s expected_time so a 90s answer is "slow".
    const sLong = comprehensionDifficultySignal(
      compMc({ time_to_answer_sec: 90, expected_time_sec: 30 }),
    );
    const sShort = comprehensionDifficultySignal(compMc({ time_to_answer_sec: 90 }));
    expect(sLong).toBeLessThan(sShort);
  });

  it("multiple_choice format default expected time = 60s (slow at 120s)", () => {
    // 120s is 2x expected (60s default) → overtime clamps near 1 → -0.5.
    const s = comprehensionDifficultySignal(
      compMc({ correct: false, time_to_answer_sec: 120 }),
    );
    // correct=false (no bonus). overtime ratio=2 → (2-1)/(2-1)=1 → -0.5.
    expect(s).toBeCloseTo(-0.5, 6);
  });

  it("free_text format default expected time = 180s", () => {
    // 360s is 2x expected (180s default) → overtime clamps near 1.
    const s = comprehensionDifficultySignal(
      compFt({ rubric_score: 1, time_to_answer_sec: 360 }),
    );
    expect(s).toBeCloseTo(-0.5, 6);
  });
});

describe("comprehension difficulty: nextComprehensionDifficulty", () => {
  it("multiple_choice clean solve at easy → medium (step up)", () => {
    expect(nextComprehensionDifficulty("easy", compMc())).toBe("medium");
  });

  it("multiple_choice incorrect + slow + many hints at hard → medium (step down)", () => {
    const next = nextComprehensionDifficulty(
      "hard",
      compMc({
        correct: false,
        time_to_answer_sec: 240,
        attempt_count: 4,
        hint_count: 3,
      }),
    );
    expect(next).toBe("medium");
  });

  it("free_text rubric=3 + average time at medium → medium (no step)", () => {
    const next = nextComprehensionDifficulty(
      "medium",
      compFt({ rubric_score: 3, time_to_answer_sec: 180 }),
    );
    expect(next).toBe("medium");
  });
});

// Regression — implement/debug path is unchanged by the comprehension branch.
describe("implement/debug path is unchanged by the comprehension branch (regression)", () => {
  it("implement clean solve = success score 1 (same as before)", () => {
    expect(episodeSuccessScore(ep())).toBe(1);
  });

  it("implement nextDifficulty: easy → medium on perfect solve (same as before)", () => {
    expect(nextDifficulty("easy", ep({ time_to_solve_ms: 30_000 }))).toBe("medium");
  });

  it("implement difficultySignal for perfect solve = +correctness_bonus (same as before)", () => {
    const s = difficultySignal(ep({ time_to_solve_ms: 60_000 }));
    expect(s).toBeCloseTo(DEFAULT_DIFFICULTY_HEURISTIC.correctness_bonus, 6);
  });
});
