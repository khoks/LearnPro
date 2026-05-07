import { describe, expect, it } from "vitest";
import {
  ComprehensionPolicyConfigSchema,
  ComprehensionScoreSchema,
  comprehensionTargetScore,
  coldStartComprehension,
  updateComprehensionScore,
} from "./comprehension-policy.js";

describe("coldStartComprehension (STORY-038)", () => {
  it("returns a 0.5 / 0 / 0 prior for a new concept", () => {
    const seed = coldStartComprehension("list-comprehension");
    expect(seed).toEqual({
      concept_tag: "list-comprehension",
      score: 0.5,
      confidence: 0,
      attempts: 0,
    });
    expect(ComprehensionScoreSchema.safeParse(seed).success).toBe(true);
  });
});

describe("comprehensionTargetScore (STORY-038)", () => {
  it("returns 1 on correct", () => {
    expect(comprehensionTargetScore({ correct: true })).toBe(1);
  });
  it("returns 0 on incorrect", () => {
    expect(comprehensionTargetScore({ correct: false })).toBe(0);
  });
});

describe("updateComprehensionScore (STORY-038)", () => {
  const prev = coldStartComprehension("list-comprehension");

  it("pushes score upward on a correct answer", () => {
    const next = updateComprehensionScore(prev, { correct: true });
    expect(next.score).toBeGreaterThan(prev.score);
    expect(next.attempts).toBe(1);
    expect(next.confidence).toBeGreaterThan(0);
  });

  it("pulls score downward on an incorrect answer", () => {
    const next = updateComprehensionScore(prev, { correct: false });
    expect(next.score).toBeLessThan(prev.score);
    expect(next.attempts).toBe(1);
  });

  it("respects ewma_alpha = 0.4 default (next = 0.4*target + 0.6*prev)", () => {
    const next = updateComprehensionScore(prev, { correct: true });
    // 0.4 * 1 + 0.6 * 0.5 = 0.7
    expect(next.score).toBeCloseTo(0.7, 6);
  });

  it("clamps score to [0, 1] across many updates", () => {
    let s = prev;
    for (let i = 0; i < 100; i++) {
      s = updateComprehensionScore(s, { correct: true });
    }
    expect(s.score).toBeLessThanOrEqual(1);
    expect(s.confidence).toBeLessThanOrEqual(0.95);
  });

  it("growth saturates at confidence_max", () => {
    let s = prev;
    for (let i = 0; i < 1000; i++) {
      s = updateComprehensionScore(s, { correct: true });
    }
    expect(s.confidence).toBeCloseTo(0.95, 1);
  });

  it("got_help=true is a no-op (returns prev unchanged) — STORY-042 anti-dark-pattern", () => {
    const next = updateComprehensionScore(prev, { correct: true, got_help: true });
    expect(next).toEqual(prev);
  });

  it("preserves the concept_tag through updates", () => {
    const next = updateComprehensionScore(prev, { correct: true });
    expect(next.concept_tag).toBe("list-comprehension");
  });

  it("rejects malformed signal at the schema boundary", () => {
    expect(() =>
      updateComprehensionScore(prev, {
        correct: "yes" as unknown as boolean,
      }),
    ).toThrow();
  });
});

describe("ComprehensionPolicyConfigSchema (STORY-038)", () => {
  it("provides sensible defaults", () => {
    const cfg = ComprehensionPolicyConfigSchema.parse({});
    expect(cfg.ewma_alpha).toBe(0.4);
    expect(cfg.confidence_growth).toBe(0.1);
    expect(cfg.confidence_max).toBe(0.95);
  });

  it("rejects out-of-range alpha", () => {
    expect(ComprehensionPolicyConfigSchema.safeParse({ ewma_alpha: 1.5 }).success).toBe(false);
  });
});
