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
  // STORY-042 — when true, the user opted in to "I got help on this one" for this submission. The
  // episode is still graded normally (tests still run, XP still awards) but `updateSkillScore`
  // skips the concept-mastery bump so the user's profile stays honest. Default false; existing
  // call sites that don't supply the flag get the original behavior.
  got_help: z.boolean().default(false),
});
// `z.input` rather than `z.infer` so callers can omit the defaulted `got_help` field. Internal
// readers (`updateSkillScore`, `episodeSuccessScore`) treat undefined as false — explicit code at
// the top of those functions parses through the schema OR coerces `got_help ?? false`.
export type EpisodeSignalInput = z.input<typeof EpisodeSignalInputSchema>;

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
//
// STORY-042 — when `episode.got_help === true`, the function returns prev unchanged. The user
// opted in to "I got help on this one" for this submission; the submission was graded normally
// (tests still run, XP still awarded) but we don't reward concept mastery for code that wasn't
// theirs. Anti-dark-pattern: never *penalize* — just don't reward.
export function updateSkillScore(
  prev: ConceptSkill,
  episode: EpisodeSignalInput,
  config: DifficultyHeuristicConfig = DEFAULT_DIFFICULTY_HEURISTIC,
): ConceptSkill {
  if (episode.got_help === true) {
    return prev;
  }
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

// STORY-038b — comprehension difficulty calibration. The signals above ("submit_count",
// "tests_passed/total", "hints_used as fraction of hints_cap=3") are calibrated for
// `kind: "implement"` / `kind: "debug"` episodes — the learner writes code, runs it against
// hidden tests, and iterates. For `kind: "comprehension"` episodes those inputs are nonsensical:
//
//   - multiple_choice problems are binary correct/incorrect — no partial credit, no hidden tests.
//   - free_text problems are graded 1-5 by a rubric (Haiku). Partial credit is the rubric_score.
//   - Code-quality signals (idiomatic, efficiency) don't apply — the user is reading, not writing.
//
// The functions below are the comprehension-axis equivalent of `episodeSuccessScore` /
// `difficultySignal` / `nextDifficulty`. They're a separate code path so the existing
// implement/debug branch stays byte-for-byte the same. The grade tool dispatches by
// `episode.problem.kind` (STORY-038a) — the same dispatch threads through here.

// Renamed-for-scoring so this doesn't shadow `ComprehensionFormatSchema` in
// @learnpro/problems (which describes the predict/trace/reason sub-format on the problem YAML —
// a different axis from the answer-format we use here for scoring).
export const ComprehensionAnswerFormatSchema = z.enum(["multiple_choice", "free_text"]);
export type ComprehensionAnswerFormatForScoring = z.infer<typeof ComprehensionAnswerFormatSchema>;

// Default expected times — comprehension is faster than implement. Multiple-choice has 4 options
// to read + a click; free-text needs the learner to compose a sentence. Per-problem
// `expected_time_sec` on the YAML overrides these (see schema's
// `expected_median_time_to_solve_ms`).
export const DEFAULT_COMPREHENSION_EXPECTED_TIME_SEC = {
  multiple_choice: 60,
  free_text: 180,
} as const satisfies Record<ComprehensionAnswerFormatForScoring, number>;

// Multiple-choice success ladder. Mirrors how a human teacher would weigh "answered correctly"
// against "needed help":
//   - first-try correct (no hints, single attempt) → 1.0
//   - correct after 1 hint OR exactly 2 attempts → 0.6
//   - correct after 2+ hints OR 3+ attempts → 0.3
//   - never correct → 0.0
// Tunable so future calibration off real telemetry stays mechanical.
export const ComprehensionMcSuccessConfigSchema = z.object({
  clean_score: z.number().min(0).max(1).default(1.0),
  one_hint_or_two_attempts_score: z.number().min(0).max(1).default(0.6),
  multi_hint_or_attempts_score: z.number().min(0).max(1).default(0.3),
  incorrect_score: z.number().min(0).max(1).default(0.0),
});
export type ComprehensionMcSuccessConfig = z.infer<typeof ComprehensionMcSuccessConfigSchema>;

export const ComprehensionHeuristicConfigSchema = z.object({
  // Signal weights — mirror the implement/debug shape so a comprehension signal in [-1, +1] reads
  // the same direction as an implement signal at the tier-ladder call site.
  weight_overtime: z.number().default(-0.5),
  weight_hint_usage: z.number().default(-0.3),
  weight_failed_attempts: z.number().default(-0.2),
  correctness_bonus: z.number().default(0.3),
  step_up_threshold: z.number().default(0.3),
  step_down_threshold: z.number().default(-0.3),
  overtime_cap_ratio: z.number().min(1).default(2.0),
  hints_cap: z.number().int().min(1).default(3),
  failed_attempts_cap: z.number().int().min(1).default(4),
  mc_success: ComprehensionMcSuccessConfigSchema.default({}),
});
export type ComprehensionHeuristicConfig = z.infer<typeof ComprehensionHeuristicConfigSchema>;

export const DEFAULT_COMPREHENSION_HEURISTIC: ComprehensionHeuristicConfig =
  ComprehensionHeuristicConfigSchema.parse({});

// Per-episode signal carrying everything the comprehension-axis heuristic needs. Discriminated by
// `comprehension_format` so multiple_choice and free_text can't be mixed at a call site.
export const ComprehensionEpisodeSignalInputSchema = z.discriminatedUnion("comprehension_format", [
  z.object({
    comprehension_format: z.literal("multiple_choice"),
    correct: z.boolean(),
    time_to_answer_sec: z.number().min(0),
    attempt_count: z.number().int().min(1),
    hint_count: z.number().int().min(0),
    expected_time_sec: z.number().positive().optional(),
    // STORY-042 — mirror the implement/debug got_help marker. When true, downstream policy code
    // no-ops the comprehension-axis EWMA (already implemented in comprehension-policy.ts). The
    // per-episode signal carries it through so a single deps adapter can wire both.
    got_help: z.boolean().default(false),
  }),
  z.object({
    comprehension_format: z.literal("free_text"),
    rubric_score: z.number().int().min(1).max(5),
    time_to_answer_sec: z.number().min(0),
    attempt_count: z.number().int().min(1),
    hint_count: z.number().int().min(0),
    expected_time_sec: z.number().positive().optional(),
    got_help: z.boolean().default(false),
  }),
]);
export type ComprehensionEpisodeSignalInput = z.input<
  typeof ComprehensionEpisodeSignalInputSchema
>;

// Per-episode contribution to the comprehension-axis skill score, in [0, 1]. The shape matches
// `episodeSuccessScore` so consumers can substitute one for the other based on
// `episode.problem.kind`.
export function comprehensionEpisodeSuccessScore(
  episode: ComprehensionEpisodeSignalInput,
  config: ComprehensionHeuristicConfig = DEFAULT_COMPREHENSION_HEURISTIC,
): number {
  const parsed = ComprehensionEpisodeSignalInputSchema.parse(episode);
  if (parsed.comprehension_format === "multiple_choice") {
    if (!parsed.correct) return clamp01(config.mc_success.incorrect_score);
    const hints = parsed.hint_count;
    const attempts = parsed.attempt_count;
    if (hints === 0 && attempts === 1) return clamp01(config.mc_success.clean_score);
    if (hints >= 2 || attempts >= 3)
      return clamp01(config.mc_success.multi_hint_or_attempts_score);
    return clamp01(config.mc_success.one_hint_or_two_attempts_score);
  }
  return clamp01((parsed.rubric_score - 1) / 4);
}

// Returns the per-episode comprehension difficulty signal `s` in roughly [-1, +1]. Negative =
// struggled (slow / many hints / multiple attempts); positive = breezed through.
export function comprehensionDifficultySignal(
  episode: ComprehensionEpisodeSignalInput,
  config: ComprehensionHeuristicConfig = DEFAULT_COMPREHENSION_HEURISTIC,
): number {
  const parsed = ComprehensionEpisodeSignalInputSchema.parse(episode);
  const success = comprehensionEpisodeSuccessScore(parsed, config);
  const expectedTimeSec =
    parsed.expected_time_sec ??
    DEFAULT_COMPREHENSION_EXPECTED_TIME_SEC[parsed.comprehension_format];
  const overtimeRatio = parsed.time_to_answer_sec / expectedTimeSec;
  const overtime = clamp01((overtimeRatio - 1) / (config.overtime_cap_ratio - 1));
  const hintUsage = clamp01(parsed.hint_count / config.hints_cap);
  const failedAttempts = clamp01((parsed.attempt_count - 1) / config.failed_attempts_cap);
  const correctness = success >= 0.6 && parsed.hint_count === 0 ? config.correctness_bonus : 0;
  return (
    config.weight_overtime * overtime +
    config.weight_hint_usage * hintUsage +
    config.weight_failed_attempts * failedAttempts +
    correctness
  );
}

// Returns the next tier given the comprehension episode just completed. Same step-direction rules
// as `nextDifficulty`.
export function nextComprehensionDifficulty(
  current: DifficultyTier,
  episode: ComprehensionEpisodeSignalInput,
  config: ComprehensionHeuristicConfig = DEFAULT_COMPREHENSION_HEURISTIC,
): DifficultyTier {
  const s = comprehensionDifficultySignal(episode, config);
  if (s >= config.step_up_threshold) return stepTier(current, +1);
  if (s <= config.step_down_threshold) return stepTier(current, -1);
  return current;
}
