import { z } from "zod";

// STORY-037 — bug-finding skill axis. Per-archetype EWMA score in [0, 1] tracking how reliably
// the user identifies+fixes a given bug archetype. Mirrors the `ConceptSkill` shape so the same
// EWMA semantics + clamp rules apply, but it's keyed by `bug_archetype` rather than `concept_id`.
//
// Why a separate axis (and not a concept tag): "found bug correctly" is orthogonal to "wrote new
// code correctly" — STORY-037 explicitly calls this out as a different skill. A user who can fix
// off-by-one bugs blind isn't necessarily strong at WRITING code that's free of off-by-ones (and
// vice-versa). The axis lets the assigner / planner reason about debug-strength independently.
//
// The catalogued archetypes mirror @learnpro/problems' BugArchetypeSchema verbatim — kept separate
// here so the scoring package doesn't depend on @learnpro/problems (it's a leaf module by design).

export const BUG_ARCHETYPES = [
  "off_by_one",
  "mutation_in_iteration",
  "reference_equality",
  "async_race",
  "late_binding",
  "shadowing",
  "type_coercion",
  "default_arg_mutability",
] as const;

export const BugArchetypeKeySchema = z.enum(BUG_ARCHETYPES);
export type BugArchetypeKey = z.infer<typeof BugArchetypeKeySchema>;

export const BugFindingScoreSchema = z.object({
  archetype: BugArchetypeKeySchema,
  // EWMA-flavored skill in [0, 1]. 0 = consistently fails to identify; 1 = consistently nails it.
  // Cold-start is 0.5 (uniform prior).
  score: z.number().min(0).max(1),
  // Same shape as ConceptSkill.confidence — grows monotonically toward `confidence_max`.
  confidence: z.number().min(0).max(1),
  // Total submit closes that touched this archetype (passed or failed).
  attempts: z.number().int().min(0),
});
export type BugFindingScore = z.infer<typeof BugFindingScoreSchema>;

export const BugFindingPolicyConfigSchema = z.object({
  ewma_alpha: z.number().min(0).max(1).default(0.4),
  confidence_growth: z.number().min(0).max(1).default(0.1),
  confidence_max: z.number().min(0).max(1).default(0.95),
  // Two-axis target signal:
  //   - solved_passing: did the hidden tests pass? (the floor)
  //   - named_bug:      did the user's natural-language explanation correctly identify the bug?
  // The combined target maps to a [0,1] outcome that the EWMA absorbs.
  // Default weights: passing tests carries 0.6, naming the bug carries 0.4. Naming alone (without
  // a passing fix) is *not* full credit — the test floor is non-negotiable.
  weight_passing: z.number().min(0).max(1).default(0.6),
  weight_named: z.number().min(0).max(1).default(0.4),
});
export type BugFindingPolicyConfig = z.infer<typeof BugFindingPolicyConfigSchema>;

export const DEFAULT_BUG_FINDING_POLICY: BugFindingPolicyConfig =
  BugFindingPolicyConfigSchema.parse({});

export const BugFindingSignalSchema = z.object({
  passed: z.boolean(),
  named_bug: z.boolean(),
  // STORY-037 — propagated from the per-submission "I got help" toggle (STORY-042). When true the
  // scoring update no-ops (returns prev) — same anti-dark-pattern as `updateSkillScore`.
  got_help: z.boolean().default(false),
});
export type BugFindingSignalInput = z.input<typeof BugFindingSignalSchema>;

export function coldStartBugFinding(archetype: BugArchetypeKey): BugFindingScore {
  return { archetype, score: 0.5, confidence: 0, attempts: 0 };
}

export function bugFindingTargetScore(
  signal: { passed: boolean; named_bug: boolean },
  config: BugFindingPolicyConfig = DEFAULT_BUG_FINDING_POLICY,
): number {
  const passed = signal.passed ? 1 : 0;
  const named = signal.named_bug ? 1 : 0;
  const total = config.weight_passing * passed + config.weight_named * named;
  // Clamp into [0, 1] in case operator config sums to >1.
  if (total < 0) return 0;
  if (total > 1) return 1;
  return total;
}

export function updateBugFindingScore(
  prev: BugFindingScore,
  signal: BugFindingSignalInput,
  config: BugFindingPolicyConfig = DEFAULT_BUG_FINDING_POLICY,
): BugFindingScore {
  const parsed = BugFindingSignalSchema.parse(signal);
  if (parsed.got_help) return prev;
  const target = bugFindingTargetScore(parsed, config);
  const next_score = config.ewma_alpha * target + (1 - config.ewma_alpha) * prev.score;
  const next_confidence = clamp01(
    Math.min(config.confidence_max, prev.confidence + config.confidence_growth),
  );
  return {
    archetype: prev.archetype,
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
