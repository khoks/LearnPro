import { z } from "zod";
import { FinalOutcomeSchema, type FinalOutcome } from "./xp-streak-types.js";

// Per-episode XP award computation. Pure — no DB access, no clock dependency. The DB layer
// (`@learnpro/db/xp-streak.ts`) calls this when grading closes an episode and persists the
// returned `{ amount, reason }`. Stays separate from the older `ScoringPolicy` (in
// `scoring-policy.ts`) which models a richer rule-based decision; the MVP gamification surface
// only needs a numeric XP credit + a short reason discriminator.

export const XpReasonSchema = z.enum([
  "episode-passed",
  "episode-passed-with-hints",
  "episode-failed",
  "episode-revealed",
  "episode-abandoned",
]);
export type XpReason = z.infer<typeof XpReasonSchema>;

// Difficulty rungs match @learnpro/problems' integer 1..5 scale (see ProblemDef.difficulty).
// Multipliers chosen so that "expert" pays roughly 4.5x an "easy" — generous enough to make hard
// problems feel rewarded, soft enough that nobody can grind expert problems to absurd XP totals.
export const XpPolicyConfigSchema = z.object({
  base_xp_per_problem: z.number().min(0).default(10),
  difficulty_multiplier_by_level: z
    .object({
      "1": z.number().min(0).default(1.0),
      "2": z.number().min(0).default(1.5),
      "3": z.number().min(0).default(2.0),
      "4": z.number().min(0).default(3.0),
      "5": z.number().min(0).default(4.5),
    })
    .default({}),
  correctness_multiplier_passed: z.number().min(0).max(1).default(1.0),
  correctness_multiplier_passed_with_hints: z.number().min(0).max(1).default(0.7),
  correctness_multiplier_failed: z.number().min(0).max(1).default(0.0),
  // Hint cost table — one entry per hint rung. Canonical STORY-017 numbers: rung1=5,
  // rung2=15, rung3=30 XP (the non-linear bump steers learners toward conceptual hints first).
  // Total hint cost subtracted from a passed episode's award is the SUM of the per-rung costs
  // for the hints that were actually consumed (so 2 hints used → cost 5 + 15 = 20).
  // Per STORY-017 each rung is configurable per problem; the array form lets a future Story
  // wire that without re-shaping the schema.
  hint_cost_xp_by_rung: z.array(z.number().int().min(0)).default([5, 15, 30]),
});
export type XpPolicyConfig = z.infer<typeof XpPolicyConfigSchema>;

export const DEFAULT_XP_POLICY: XpPolicyConfig = XpPolicyConfigSchema.parse({});

export const XpAwardInputSchema = z.object({
  outcome: FinalOutcomeSchema,
  difficulty: z.number().int().min(1).max(5),
  hints_used: z.number().int().min(0),
});
export type XpAwardInput = z.infer<typeof XpAwardInputSchema>;

export interface XpAwardResult {
  amount: number;
  reason: XpReason;
}

// Computes the XP grant for a single closed episode. Floors at 0 so a hint-heavy struggle
// never goes negative. The `reason` discriminator picks the multiplier and feeds the unique
// constraint on `xp_awards(user_id, episode_id, reason)` for idempotency.
export function awardXpForEpisode(
  input: XpAwardInput,
  config: XpPolicyConfig = DEFAULT_XP_POLICY,
): XpAwardResult {
  const reason = reasonFor(input.outcome);

  // Failed / revealed / abandoned all award 0 — but we still emit the reason row so the
  // dashboard can show "you tried 12 problems even though you only passed 7". The amount is 0
  // because correctness multiplier is 0 in those cases (see XP formula below).
  const correctness = correctnessFor(input.outcome, config);
  const difficultyMult = difficultyMultiplier(input.difficulty, config);
  const base = config.base_xp_per_problem * difficultyMult * correctness;

  // Hint cost only kicks in when correctness > 0 — penalizing a failed attempt for using hints
  // would punish the right behavior (asking for help when stuck).
  const hintCost = correctness > 0 ? hintCostFor(input.hints_used, config) : 0;

  const amount = Math.max(0, Math.floor(base - hintCost));
  return { amount, reason };
}

function reasonFor(outcome: FinalOutcome): XpReason {
  switch (outcome) {
    case "passed":
      return "episode-passed";
    case "passed_with_hints":
      return "episode-passed-with-hints";
    case "failed":
      return "episode-failed";
    case "revealed":
      return "episode-revealed";
    case "abandoned":
      return "episode-abandoned";
  }
}

function correctnessFor(outcome: FinalOutcome, config: XpPolicyConfig): number {
  switch (outcome) {
    case "passed":
      return config.correctness_multiplier_passed;
    case "passed_with_hints":
      return config.correctness_multiplier_passed_with_hints;
    case "failed":
    case "revealed":
    case "abandoned":
      return config.correctness_multiplier_failed;
  }
}

function difficultyMultiplier(level: number, config: XpPolicyConfig): number {
  const key = String(level) as "1" | "2" | "3" | "4" | "5";
  return config.difficulty_multiplier_by_level[key];
}

// Sum of per-rung hint costs for rungs 1..hints_used. If the user requested more hints than
// the configured table has rungs (shouldn't happen — STORY-017 caps at 3 — but defensible),
// the last entry's cost is reused for any extra rungs. With default [5, 15, 30]: 1 hint = 5,
// 2 hints = 20, 3 hints = 50, 4 hints = 80.
function hintCostFor(hints_used: number, config: XpPolicyConfig): number {
  if (hints_used <= 0) return 0;
  const table = config.hint_cost_xp_by_rung;
  if (table.length === 0) return 0;
  let total = 0;
  for (let i = 0; i < hints_used; i += 1) {
    const idx = Math.min(i, table.length - 1);
    total += table[idx] ?? 0;
  }
  return total;
}
