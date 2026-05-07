import { z } from "zod";

// STORY-038 — comprehension-accuracy skill axis. Per-concept-tag EWMA score in [0, 1] tracking how
// reliably the user answers comprehension exercises (predict / trace / reason) for a given concept.
// Mirrors the `ConceptSkill` shape so the same EWMA semantics + clamp rules apply, but it's
// recorded SEPARATELY from the coding-skill axis: a learner who can READ list-comprehension code
// fluently isn't necessarily strong at WRITING it (and vice-versa). The axis lets the assigner /
// planner reason about reading-strength independently.
//
// Why a separate axis (and not just a concept tag): comprehension and coding are orthogonal in
// the same way bug-finding (STORY-037) is orthogonal — STORY-038 explicitly calls this out as a
// different skill. The architecture mirrors bug-finding-policy verbatim so the two axes share the
// same EWMA shape and confidence growth.

export const ComprehensionScoreSchema = z.object({
  concept_tag: z.string().min(1),
  // EWMA-flavored skill in [0, 1]. 0 = consistently misses; 1 = consistently nails it.
  // Cold-start is 0.5 (uniform prior).
  score: z.number().min(0).max(1),
  // Same shape as ConceptSkill.confidence — grows monotonically toward `confidence_max`.
  confidence: z.number().min(0).max(1),
  // Total comprehension submissions that touched this concept (correct or incorrect).
  attempts: z.number().int().min(0),
});
export type ComprehensionScore = z.infer<typeof ComprehensionScoreSchema>;

export const ComprehensionPolicyConfigSchema = z.object({
  ewma_alpha: z.number().min(0).max(1).default(0.4),
  confidence_growth: z.number().min(0).max(1).default(0.1),
  confidence_max: z.number().min(0).max(1).default(0.95),
});
export type ComprehensionPolicyConfig = z.infer<typeof ComprehensionPolicyConfigSchema>;

export const DEFAULT_COMPREHENSION_POLICY: ComprehensionPolicyConfig =
  ComprehensionPolicyConfigSchema.parse({});

export const ComprehensionSignalSchema = z.object({
  // Single-axis: did the learner answer correctly? Multiple-choice index match or free-text
  // grader verdict — the upstream `gradeComprehension` produces either, the policy doesn't care.
  correct: z.boolean(),
  // STORY-042 — propagated from the per-submission "I got help" toggle. When true the scoring
  // update no-ops (returns prev) — same anti-dark-pattern as updateSkillScore.
  got_help: z.boolean().default(false),
});
export type ComprehensionSignalInput = z.input<typeof ComprehensionSignalSchema>;

export function coldStartComprehension(concept_tag: string): ComprehensionScore {
  return { concept_tag, score: 0.5, confidence: 0, attempts: 0 };
}

export function comprehensionTargetScore(signal: { correct: boolean }): number {
  return signal.correct ? 1 : 0;
}

export function updateComprehensionScore(
  prev: ComprehensionScore,
  signal: ComprehensionSignalInput,
  config: ComprehensionPolicyConfig = DEFAULT_COMPREHENSION_POLICY,
): ComprehensionScore {
  const parsed = ComprehensionSignalSchema.parse(signal);
  if (parsed.got_help) return prev;
  const target = comprehensionTargetScore(parsed);
  const next_score = config.ewma_alpha * target + (1 - config.ewma_alpha) * prev.score;
  const next_confidence = clamp01(
    Math.min(config.confidence_max, prev.confidence + config.confidence_growth),
  );
  return {
    concept_tag: prev.concept_tag,
    score: round6(clamp01(next_score)),
    confidence: round6(next_confidence),
    attempts: prev.attempts + 1,
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}
