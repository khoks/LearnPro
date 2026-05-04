import { describe, expect, it } from "vitest";
import {
  awardXpForEpisode,
  DEFAULT_XP_POLICY,
  XpPolicyConfigSchema,
  type XpPolicyConfig,
} from "./xp-policy.js";

const CUSTOM: XpPolicyConfig = XpPolicyConfigSchema.parse({
  base_xp_per_problem: 100,
  hint_cost_xp_by_rung: [10, 20, 40],
});

describe("awardXpForEpisode (defaults)", () => {
  it("clean pass at difficulty 1 awards 10 (base × 1.0 × 1.0)", () => {
    const r = awardXpForEpisode({ outcome: "passed", difficulty: 1, hints_used: 0 });
    expect(r).toEqual({ amount: 10, reason: "episode-passed" });
  });

  it("clean pass at difficulty 3 awards 20 (10 × 2.0 × 1.0)", () => {
    const r = awardXpForEpisode({ outcome: "passed", difficulty: 3, hints_used: 0 });
    expect(r).toEqual({ amount: 20, reason: "episode-passed" });
  });

  it("clean pass at difficulty 5 awards 45 (10 × 4.5 × 1.0)", () => {
    const r = awardXpForEpisode({ outcome: "passed", difficulty: 5, hints_used: 0 });
    expect(r).toEqual({ amount: 45, reason: "episode-passed" });
  });

  it("passed_with_hints applies the 0.7 correctness multiplier (10 × 2.0 × 0.7 = 14)", () => {
    const r = awardXpForEpisode({ outcome: "passed_with_hints", difficulty: 3, hints_used: 1 });
    // 10 × 2.0 × 0.7 = 14, minus rung-1 cost 5 = 9. Floored gives 9.
    expect(r).toEqual({ amount: 9, reason: "episode-passed-with-hints" });
  });

  it("hint cost ladder matches STORY-017: 1 hint = 5, 2 hints = 20, 3 hints = 50", () => {
    // Use a high enough base that the cost subtraction is the dominant signal we're verifying.
    const config = XpPolicyConfigSchema.parse({ base_xp_per_problem: 1000 });
    const expected = (h: number) => 1000 * 2.0 * 0.7 - [0, 5, 20, 50][h]!;
    for (const h of [1, 2, 3] as const) {
      const r = awardXpForEpisode(
        { outcome: "passed_with_hints", difficulty: 3, hints_used: h },
        config,
      );
      expect(r.amount).toBe(Math.floor(expected(h)));
    }
  });

  it("failed outcome awards 0 XP (correctness multiplier 0)", () => {
    const r = awardXpForEpisode({ outcome: "failed", difficulty: 5, hints_used: 0 });
    expect(r).toEqual({ amount: 0, reason: "episode-failed" });
  });

  it("revealed outcome awards 0 XP (correctness multiplier 0)", () => {
    const r = awardXpForEpisode({ outcome: "revealed", difficulty: 3, hints_used: 0 });
    expect(r).toEqual({ amount: 0, reason: "episode-revealed" });
  });

  it("abandoned outcome awards 0 XP", () => {
    const r = awardXpForEpisode({ outcome: "abandoned", difficulty: 3, hints_used: 2 });
    expect(r).toEqual({ amount: 0, reason: "episode-abandoned" });
  });

  it("hint cost cannot drag a passed episode below 0 (floored)", () => {
    // d=1 × passed_with_hints (0.7) × base 10 = 7 XP earned, minus 50 hint cost → floor at 0.
    const r = awardXpForEpisode({ outcome: "passed_with_hints", difficulty: 1, hints_used: 3 });
    expect(r.amount).toBe(0);
  });

  it("failed solve with hints used does not subtract hint cost (would punish help-seeking)", () => {
    // Verifies the "correctness > 0 only" guard: failed → 0 base XP, no negative hint cost.
    const r = awardXpForEpisode({ outcome: "failed", difficulty: 3, hints_used: 3 });
    expect(r.amount).toBe(0);
  });

  it("DEFAULT_XP_POLICY parses cleanly with all expected default fields", () => {
    expect(DEFAULT_XP_POLICY.base_xp_per_problem).toBe(10);
    expect(DEFAULT_XP_POLICY.difficulty_multiplier_by_level["5"]).toBe(4.5);
    expect(DEFAULT_XP_POLICY.hint_cost_xp_by_rung).toEqual([5, 15, 30]);
  });
});

describe("awardXpForEpisode (operator-overridden config)", () => {
  it("respects custom base_xp_per_problem and difficulty multipliers", () => {
    const r = awardXpForEpisode({ outcome: "passed", difficulty: 1, hints_used: 0 }, CUSTOM);
    expect(r.amount).toBe(100);
  });

  it("respects a custom hint cost table", () => {
    const r = awardXpForEpisode(
      { outcome: "passed_with_hints", difficulty: 1, hints_used: 2 },
      CUSTOM,
    );
    // 100 × 1.0 × 0.7 = 70, minus (10 + 20) = 40.
    expect(r.amount).toBe(40);
  });

  it("re-uses the last rung's cost when hints_used exceeds the table length", () => {
    const r = awardXpForEpisode(
      { outcome: "passed_with_hints", difficulty: 5, hints_used: 5 },
      CUSTOM,
    );
    // hint_cost_xp_by_rung = [10, 20, 40]. rung 4 reuses 40, rung 5 reuses 40.
    // 100 × 4.5 × 0.7 = 315; cost = 10 + 20 + 40 + 40 + 40 = 150. Net 165.
    expect(r.amount).toBe(165);
  });
});
