import { describe, expect, it } from "vitest";
import {
  FsrsCardStateSchema,
  initialCardState,
  isDue,
  mapEpisodeOutcomeToGrade,
  recomputeAfterReview,
  type FsrsCardState,
} from "./spaced-repetition.js";

const FIXED_NOW = new Date("2026-04-30T12:00:00.000Z");

describe("spaced-repetition: initialCardState", () => {
  it("returns a valid Zod-validated card with non-null `due`", () => {
    const state = initialCardState(FIXED_NOW);
    expect(() => FsrsCardStateSchema.parse(state)).not.toThrow();
    expect(state.due).toBeTruthy();
    expect(state.lapses).toBe(0);
    expect(state.last_reviewed).toBeNull();
  });

  it("difficulty is in the canonical [0, 10] range (0 is the cold-start sentinel)", () => {
    const state = initialCardState(FIXED_NOW);
    expect(state.difficulty).toBeGreaterThanOrEqual(0);
    expect(state.difficulty).toBeLessThanOrEqual(10);
  });

  it("after a first graded review, difficulty lands in the post-review [1, 10] band", () => {
    const seed = initialCardState(FIXED_NOW);
    const next = recomputeAfterReview({ state: seed, grade: "good", now: FIXED_NOW });
    expect(next.difficulty).toBeGreaterThanOrEqual(1);
    expect(next.difficulty).toBeLessThanOrEqual(10);
  });

  it("stability is non-negative", () => {
    const state = initialCardState(FIXED_NOW);
    expect(state.stability).toBeGreaterThanOrEqual(0);
  });
});

describe("spaced-repetition: isDue", () => {
  it("a fresh card is due immediately (cold-start kicks off review)", () => {
    const state = initialCardState(FIXED_NOW);
    expect(isDue({ state, now: FIXED_NOW })).toBe(true);
  });

  it("a card whose due is strictly in the future is not due", () => {
    const state: FsrsCardState = {
      stability: 5,
      difficulty: 5,
      due: new Date(FIXED_NOW.getTime() + 86400_000).toISOString(),
      lapses: 0,
      last_reviewed: FIXED_NOW.toISOString(),
    };
    expect(isDue({ state, now: FIXED_NOW })).toBe(false);
  });

  it("a card whose due is in the past is due", () => {
    const state: FsrsCardState = {
      stability: 5,
      difficulty: 5,
      due: new Date(FIXED_NOW.getTime() - 1).toISOString(),
      lapses: 0,
      last_reviewed: new Date(FIXED_NOW.getTime() - 86400_000).toISOString(),
    };
    expect(isDue({ state, now: FIXED_NOW })).toBe(true);
  });

  it("exact-equality (now === due) counts as due", () => {
    const state: FsrsCardState = {
      stability: 5,
      difficulty: 5,
      due: FIXED_NOW.toISOString(),
      lapses: 0,
      last_reviewed: new Date(FIXED_NOW.getTime() - 1000).toISOString(),
    };
    expect(isDue({ state, now: FIXED_NOW })).toBe(true);
  });
});

describe("spaced-repetition: recomputeAfterReview - cold-start grades", () => {
  for (const grade of ["again", "hard", "good", "easy"] as const) {
    it(`first review at grade=${grade} returns a Zod-valid state with last_reviewed set`, () => {
      const prev = initialCardState(FIXED_NOW);
      const next = recomputeAfterReview({ state: prev, grade, now: FIXED_NOW });
      expect(() => FsrsCardStateSchema.parse(next)).not.toThrow();
      expect(next.last_reviewed).toBe(FIXED_NOW.toISOString());
    });
  }

  it("first review with `again` does not increment lapses (Learning-state behavior)", () => {
    const prev = initialCardState(FIXED_NOW);
    const next = recomputeAfterReview({ state: prev, grade: "again", now: FIXED_NOW });
    expect(next.lapses).toBe(0);
  });

  it("first review with `easy` schedules due strictly in the future", () => {
    const prev = initialCardState(FIXED_NOW);
    const next = recomputeAfterReview({ state: prev, grade: "easy", now: FIXED_NOW });
    expect(new Date(next.due).getTime()).toBeGreaterThan(FIXED_NOW.getTime());
  });

  it("first review with `good` schedules due strictly in the future", () => {
    const prev = initialCardState(FIXED_NOW);
    const next = recomputeAfterReview({ state: prev, grade: "good", now: FIXED_NOW });
    expect(new Date(next.due).getTime()).toBeGreaterThan(FIXED_NOW.getTime());
  });
});

describe("spaced-repetition: recomputeAfterReview - post-cold-start grades", () => {
  function reviewedCard(daysSinceReview: number): FsrsCardState {
    // Construct a Review-state card by running one cold-start `good` against the algorithm and
    // then back-dating last_reviewed by the requested number of days.
    const seeded = recomputeAfterReview({
      state: initialCardState(FIXED_NOW),
      grade: "good",
      now: FIXED_NOW,
    });
    return {
      ...seeded,
      last_reviewed: new Date(
        FIXED_NOW.getTime() - daysSinceReview * 86400_000,
      ).toISOString(),
    };
  }

  it("`again` after a real review increments lapses", () => {
    const prev = reviewedCard(7);
    const reviewAt = new Date(FIXED_NOW.getTime() + 7 * 86400_000);
    const next = recomputeAfterReview({ state: prev, grade: "again", now: reviewAt });
    expect(next.lapses).toBeGreaterThan(prev.lapses);
  });

  it("`easy` extends due further into the future than `good` for the same prior", () => {
    const prev = reviewedCard(7);
    const reviewAt = new Date(FIXED_NOW.getTime() + 7 * 86400_000);
    const afterGood = recomputeAfterReview({ state: prev, grade: "good", now: reviewAt });
    const afterEasy = recomputeAfterReview({ state: prev, grade: "easy", now: reviewAt });
    expect(new Date(afterEasy.due).getTime()).toBeGreaterThanOrEqual(
      new Date(afterGood.due).getTime(),
    );
  });

  it("`hard` schedules sooner than `good`", () => {
    const prev = reviewedCard(7);
    const reviewAt = new Date(FIXED_NOW.getTime() + 7 * 86400_000);
    const afterHard = recomputeAfterReview({ state: prev, grade: "hard", now: reviewAt });
    const afterGood = recomputeAfterReview({ state: prev, grade: "good", now: reviewAt });
    expect(new Date(afterHard.due).getTime()).toBeLessThanOrEqual(
      new Date(afterGood.due).getTime(),
    );
  });

  it("repeated `easy` reviews keep stability roughly non-eroding", () => {
    let state = reviewedCard(7);
    let lastStability = state.stability;
    let nowCursor = FIXED_NOW.getTime() + 7 * 86400_000;
    for (let i = 0; i < 5; i++) {
      const stepNow = new Date(nowCursor);
      state = recomputeAfterReview({ state, grade: "easy", now: stepNow });
      expect(state.stability).toBeGreaterThanOrEqual(lastStability * 0.9);
      lastStability = state.stability;
      // Push next review well past the current due so we don't under-shoot the algorithm.
      nowCursor = new Date(state.due).getTime() + 86400_000;
    }
  });

  it("a chain of `again` reviews keeps incrementing lapses", () => {
    let state = reviewedCard(7);
    const startLapses = state.lapses;
    let cursor = new Date(FIXED_NOW.getTime() + 7 * 86400_000);
    for (let i = 0; i < 3; i++) {
      const before = state.lapses;
      state = recomputeAfterReview({ state, grade: "again", now: cursor });
      expect(state.lapses).toBeGreaterThanOrEqual(before);
      cursor = new Date(cursor.getTime() + 86400_000);
    }
    expect(state.lapses).toBeGreaterThan(startLapses);
  });

  it("`again` does not push due infinitely far into the future (interval shortens)", () => {
    const prev = reviewedCard(7);
    const reviewAt = new Date(FIXED_NOW.getTime() + 7 * 86400_000);
    const afterAgain = recomputeAfterReview({ state: prev, grade: "again", now: reviewAt });
    expect(new Date(afterAgain.due).getTime()).toBeLessThan(
      reviewAt.getTime() + 30 * 86400_000,
    );
  });
});

describe("spaced-repetition: mapEpisodeOutcomeToGrade", () => {
  it("revealed -> again", () => {
    expect(
      mapEpisodeOutcomeToGrade({ outcome: "revealed", hints_used: 0 }),
    ).toBe("again");
  });

  it("failed -> again", () => {
    expect(
      mapEpisodeOutcomeToGrade({ outcome: "failed", hints_used: 0 }),
    ).toBe("again");
  });

  it("abandoned -> again", () => {
    expect(
      mapEpisodeOutcomeToGrade({ outcome: "abandoned", hints_used: 0 }),
    ).toBe("again");
  });

  it("passed_with_hints with exactly 1 hint -> good", () => {
    expect(
      mapEpisodeOutcomeToGrade({ outcome: "passed_with_hints", hints_used: 1 }),
    ).toBe("good");
  });

  it("passed_with_hints with 2 hints -> hard", () => {
    expect(
      mapEpisodeOutcomeToGrade({ outcome: "passed_with_hints", hints_used: 2 }),
    ).toBe("hard");
  });

  it("passed_with_hints with 3 hints -> hard", () => {
    expect(
      mapEpisodeOutcomeToGrade({ outcome: "passed_with_hints", hints_used: 3 }),
    ).toBe("hard");
  });

  it("passed with 0 hints + under-target time -> easy", () => {
    expect(
      mapEpisodeOutcomeToGrade({
        outcome: "passed",
        hints_used: 0,
        time_to_solve_ms: 30_000,
        expected_time_ms: 60_000,
      }),
    ).toBe("easy");
  });

  it("passed with 0 hints + over-target time -> good", () => {
    expect(
      mapEpisodeOutcomeToGrade({
        outcome: "passed",
        hints_used: 0,
        time_to_solve_ms: 70_000,
        expected_time_ms: 60_000,
      }),
    ).toBe("good");
  });

  it("passed with 0 hints + no time data -> good (safe default)", () => {
    expect(
      mapEpisodeOutcomeToGrade({ outcome: "passed", hints_used: 0 }),
    ).toBe("good");
  });

  it("passed with 1 hint despite under-target time -> good (no upgrade with hints)", () => {
    expect(
      mapEpisodeOutcomeToGrade({
        outcome: "passed",
        hints_used: 1,
        time_to_solve_ms: 10_000,
        expected_time_ms: 60_000,
      }),
    ).toBe("good");
  });

  it("custom under_target_multiplier narrows the easy band", () => {
    // Default 0.6 would say 30s of 60s expected = easy. With 0.4 multiplier, threshold is 24s.
    expect(
      mapEpisodeOutcomeToGrade({
        outcome: "passed",
        hints_used: 0,
        time_to_solve_ms: 30_000,
        expected_time_ms: 60_000,
        under_target_multiplier: 0.4,
      }),
    ).toBe("good");
  });

  it("passed exactly at the threshold counts as easy (inclusive boundary)", () => {
    expect(
      mapEpisodeOutcomeToGrade({
        outcome: "passed",
        hints_used: 0,
        time_to_solve_ms: 36_000,
        expected_time_ms: 60_000,
      }),
    ).toBe("easy");
  });
});

describe("spaced-repetition: end-to-end flow", () => {
  it("a full pass-pass-pass-fail sequence is internally consistent", () => {
    let state = initialCardState(FIXED_NOW);
    let cursor = FIXED_NOW.getTime();
    const grades = ["good", "good", "good", "again"] as const;
    for (const grade of grades) {
      state = recomputeAfterReview({ state, grade, now: new Date(cursor) });
      expect(() => FsrsCardStateSchema.parse(state)).not.toThrow();
      cursor = new Date(state.due).getTime() + 86400_000;
    }
  });

  it("recompute is deterministic for a given state + grade + now", () => {
    const state = initialCardState(FIXED_NOW);
    const t = new Date(FIXED_NOW.getTime() + 86400_000);
    const a = recomputeAfterReview({ state, grade: "good", now: t });
    const b = recomputeAfterReview({ state, grade: "good", now: t });
    expect(a).toEqual(b);
  });

  it("Zod rejects an invalid state shape (regression)", () => {
    const bad = {
      stability: 5,
      difficulty: 12,
      due: "not a date",
      lapses: -1,
      last_reviewed: null,
    };
    expect(() => FsrsCardStateSchema.parse(bad)).toThrow();
  });
});
