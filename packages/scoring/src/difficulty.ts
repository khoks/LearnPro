import { z } from "zod";
import { type ConceptSkill, type DifficultyTier } from "./policies/types.js";

// Heuristic per-episode difficulty signal: a single number `s` in [-1, +1] derived from how the
// learner just struggled (or didn't). The policy layer (see policies/difficulty-policy.ts) keeps
// looking at multi-episode EWMAs to pick a tier from a problem catalog; these helpers are the
// finer-grained per-episode step decision that callers can use directly between catalog lookups.
//
// Why heuristic, not learned: explicitly v1 territory. A learned model only earns its keep once we
// have enough episodes to fit one. Heuristics are interpretable, debuggable, and good enough until
// proven otherwise. See STORY-018 for the rationale.

export const TIER_ORDER: readonly DifficultyTier[] = ["easy", "medium", "hard", "expert"];

export const DifficultyHeuristicConfigSchema = z.object({
  // Signal weights — overtime/hints/failures pull `s` negative (struggle); correctness pushes positive.
  weight_overtime: z.number().default(-0.5),
  weight_hint_usage: z.number().default(-0.3),
  weight_failed_attempts: z.number().default(-0.2),
  correctness_bonus: z.number().default(0.3),
  // Step thresholds. `s > step_up_threshold` → harder; `s < step_down_threshold` → easier; otherwise same.
  step_up_threshold: z.number().default(0.3),
  step_down_threshold: z.number().default(-0.3),
  // Normalization caps — ratios above these clamp to 1 (max struggle on that axis).
  overtime_cap_ratio: z.number().min(1).default(2.0),
  hints_cap: z.number().int().min(1).default(3),
  failed_attempts_cap: z.number().int().min(1).default(4),
  // EWMA + Bayesian-flavored confidence growth for the per-concept skill score.
  ewma_alpha: z.number().min(0).max(1).default(0.4),
  confidence_growth: z.number().min(0).max(1).default(0.1),
  confidence_max: z.number().min(0).max(1).default(0.95),
  hint_skill_penalty: z.number().min(0).max(1).default(0.15),
  fail_skill_penalty: z.number().min(0).max(1).default(0.1),
});
export type DifficultyHeuristicConfig = z.infer<typeof DifficultyHeuristicConfigSchema>;

export const DEFAULT_DIFFICULTY_HEURISTIC: DifficultyHeuristicConfig =
  DifficultyHeuristicConfigSchema.parse({});

export const EpisodeSignalInputSchema = z.object({
  passed: z.boolean(),
  reveal_clicked: z.boolean(),
  hints_used: z.number().int().min(0),
  submit_count: z.number().int().min(1),
  time_to_solve_ms: z.number().int().min(0),
  expected_time_ms: z.number().int().positive(),
});
export type EpisodeSignalInput = z.infer<typeof EpisodeSignalInputSchema>;

// Returns the per-episode difficulty signal `s` in (-∞..+∞ but typically clamped near [-1, +1]).
// Negative = the learner struggled (slow, lots of hints, retries); positive = breezed through.
export function difficultySignal(
  episode: EpisodeSignalInput,
  config: DifficultyHeuristicConfig = DEFAULT_DIFFICULTY_HEURISTIC,
): number {
  const overtimeRatio = episode.time_to_solve_ms / episode.expected_time_ms;
  const overtime = clamp01((overtimeRatio - 1) / (config.overtime_cap_ratio - 1));
  const hintUsage = clamp01(episode.hints_used / config.hints_cap);
  const failedAttempts = clamp01((episode.submit_count - 1) / config.failed_attempts_cap);
  const correctness = episode.passed && !episode.reveal_clicked ? config.correctness_bonus : 0;
  return (
    config.weight_overtime * overtime +
    config.weight_hint_usage * hintUsage +
    config.weight_failed_attempts * failedAttempts +
    correctness
  );
}

// Returns the next difficulty tier given the current tier and the episode just completed.
// Step direction: signal > step_up_threshold → harder; < step_down_threshold → easier; else same.
// Caps at the ladder ends — "expert" stays "expert" if you keep crushing it.
export function nextDifficulty(
  current: DifficultyTier,
  episode: EpisodeSignalInput,
  config: DifficultyHeuristicConfig = DEFAULT_DIFFICULTY_HEURISTIC,
): DifficultyTier {
  const s = difficultySignal(episode, config);
  if (s >= config.step_up_threshold) return stepTier(current, +1);
  if (s <= config.step_down_threshold) return stepTier(current, -1);
  return current;
}

// Per-episode contribution to the per-concept skill score, in [0, 1].
// Failed solve / revealed solution = 0. Clean solve = 1. Hints + retries shave it down.
export function episodeSuccessScore(
  episode: EpisodeSignalInput,
  config: DifficultyHeuristicConfig = DEFAULT_DIFFICULTY_HEURISTIC,
): number {
  if (!episode.passed) return 0;
  if (episode.reveal_clicked) return 0;
  const hintPenalty = episode.hints_used * config.hint_skill_penalty;
  const failPenalty = (episode.submit_count - 1) * config.fail_skill_penalty;
  return Math.max(0, 1 - hintPenalty - failPenalty);
}

// Bayesian-flavored EMA update for a per-concept skill score:
// - skill: EWMA(prev.skill, this episode's success score).
// - confidence: monotonically grows toward `confidence_max` as attempts accumulate.
// - attempts: incremented.
export function updateSkillScore(
  prev: ConceptSkill,
  episode: EpisodeSignalInput,
  config: DifficultyHeuristicConfig = DEFAULT_DIFFICULTY_HEURISTIC,
): ConceptSkill {
  const x = episodeSuccessScore(episode, config);
  const skill = config.ewma_alpha * x + (1 - config.ewma_alpha) * prev.skill;
  const confidence = Math.min(
    config.confidence_max,
    prev.confidence + config.confidence_growth * (config.confidence_max - prev.confidence),
  );
  return {
    concept_id: prev.concept_id,
    skill: round6(clamp01(skill)),
    confidence: round6(clamp01(confidence)),
    attempts: prev.attempts + 1,
  };
}

function stepTier(tier: DifficultyTier, delta: number): DifficultyTier {
  const idx = TIER_ORDER.indexOf(tier);
  const next = Math.max(0, Math.min(TIER_ORDER.length - 1, idx + delta));
  return TIER_ORDER[next] as DifficultyTier;
}

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}
