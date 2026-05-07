import { describe, expect, it } from "vitest";
import {
  BUG_ARCHETYPES,
  BugArchetypeKeySchema,
  BugFindingScoreSchema,
  BugFindingPolicyConfigSchema,
  DEFAULT_BUG_FINDING_POLICY,
  bugFindingTargetScore,
  coldStartBugFinding,
  updateBugFindingScore,
} from "./bug-finding-policy.js";

describe("BUG_ARCHETYPES catalogue", () => {
  it("matches the @learnpro/problems schema enum literally (mirror, not import)", () => {
    expect(BUG_ARCHETYPES).toEqual([
      "off_by_one",
      "mutation_in_iteration",
      "reference_equality",
      "async_race",
      "late_binding",
      "shadowing",
      "type_coercion",
      "default_arg_mutability",
    ]);
  });

  it("BugArchetypeKeySchema rejects free text", () => {
    expect(BugArchetypeKeySchema.safeParse("misc-bug").success).toBe(false);
  });
});

describe("coldStartBugFinding", () => {
  it("seeds skill at 0.5 (uniform prior) and confidence at 0 / attempts 0", () => {
    const seed = coldStartBugFinding("off_by_one");
    expect(seed).toEqual({ archetype: "off_by_one", score: 0.5, confidence: 0, attempts: 0 });
    expect(BugFindingScoreSchema.safeParse(seed).success).toBe(true);
  });
});

describe("bugFindingTargetScore", () => {
  it("returns 1 when both passed and named", () => {
    expect(bugFindingTargetScore({ passed: true, named_bug: true })).toBe(1);
  });

  it("returns 0 when neither passed nor named", () => {
    expect(bugFindingTargetScore({ passed: false, named_bug: false })).toBe(0);
  });

  it("rewards passing tests more than naming alone", () => {
    const passedOnly = bugFindingTargetScore({ passed: true, named_bug: false });
    const namedOnly = bugFindingTargetScore({ passed: false, named_bug: true });
    expect(passedOnly).toBeGreaterThan(namedOnly);
  });

  it("respects custom weights via the config (sum-clamped to 1)", () => {
    const config = BugFindingPolicyConfigSchema.parse({
      weight_passing: 0.7,
      weight_named: 0.3,
    });
    expect(bugFindingTargetScore({ passed: true, named_bug: false }, config)).toBe(0.7);
    expect(bugFindingTargetScore({ passed: false, named_bug: true }, config)).toBe(0.3);
  });
});

describe("updateBugFindingScore", () => {
  const prev = coldStartBugFinding("off_by_one");

  it("moves the score toward 1 on a clean pass + named bug", () => {
    const next = updateBugFindingScore(prev, { passed: true, named_bug: true });
    expect(next.score).toBeGreaterThan(prev.score);
    expect(next.attempts).toBe(1);
    expect(next.confidence).toBeGreaterThan(prev.confidence);
    expect(next.archetype).toBe("off_by_one");
  });

  it("moves the score toward 0 on a clean fail without naming", () => {
    const next = updateBugFindingScore(prev, { passed: false, named_bug: false });
    expect(next.score).toBeLessThan(prev.score);
    expect(next.attempts).toBe(1);
  });

  it("rewards naming the bug even when the fix did not pass (partial credit)", () => {
    const namedFail = updateBugFindingScore(prev, { passed: false, named_bug: true });
    const blindFail = updateBugFindingScore(prev, { passed: false, named_bug: false });
    expect(namedFail.score).toBeGreaterThan(blindFail.score);
  });

  it("rewards passing tests even without naming the bug (still recognized as fixed)", () => {
    const passedOnly = updateBugFindingScore(prev, { passed: true, named_bug: false });
    expect(passedOnly.score).toBeGreaterThan(prev.score);
  });

  it("EWMA respects ewma_alpha — α=1 jumps straight to the target", () => {
    const config = BugFindingPolicyConfigSchema.parse({ ewma_alpha: 1 });
    const next = updateBugFindingScore(prev, { passed: true, named_bug: true }, config);
    expect(next.score).toBe(1);
  });

  it("EWMA respects ewma_alpha — α=0 freezes the score at prev (same shape, attempts++)", () => {
    const config = BugFindingPolicyConfigSchema.parse({ ewma_alpha: 0 });
    const next = updateBugFindingScore(prev, { passed: true, named_bug: true }, config);
    expect(next.score).toBe(prev.score);
    expect(next.attempts).toBe(prev.attempts + 1);
  });

  it("got_help=true short-circuits the update (anti-dark-pattern)", () => {
    const next = updateBugFindingScore(prev, { passed: true, named_bug: true, got_help: true });
    expect(next).toEqual(prev);
  });

  it("repeated passes with naming converge toward the per-attempt target via the EWMA", () => {
    let s = prev;
    for (let i = 0; i < 30; i++) {
      s = updateBugFindingScore(s, { passed: true, named_bug: true });
    }
    expect(s.score).toBeGreaterThan(0.95);
    expect(s.attempts).toBe(30);
    expect(s.confidence).toBeGreaterThan(0.9);
    expect(s.confidence).toBeLessThanOrEqual(DEFAULT_BUG_FINDING_POLICY.confidence_max);
  });

  it("BugFindingScoreSchema validates the shape on every step", () => {
    let s = prev;
    for (let i = 0; i < 5; i++) {
      s = updateBugFindingScore(s, { passed: i % 2 === 0, named_bug: i % 3 === 0 });
      expect(BugFindingScoreSchema.safeParse(s).success).toBe(true);
    }
  });
});
