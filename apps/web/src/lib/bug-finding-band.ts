import type { BugArchetypeKey } from "@learnpro/scoring";

// STORY-037b — pure helpers backing the dashboard's <BugFindingScoresCard>. The bug-finding
// score is a [0, 1] EWMA produced by `bug-finding-policy`; cold-start is 0.5. We surface it
// as a low/medium/high band so the user never sees a raw number (no percentiles, no rankings)
// — and frame each band as growth, not deficit.

export type BugFindingBand = "still learning" | "getting there" | "solid";

// Band thresholds. Centred on the 0.5 cold-start so untouched archetypes sit in the middle.
//   - score < 0.4         → "still learning"
//   - 0.4 <= score <= 0.7 → "getting there"
//   - score > 0.7         → "solid"
export const BUG_FINDING_BAND_THRESHOLDS = {
  still_learning_below: 0.4,
  solid_above: 0.7,
} as const;

export function bugFindingBand(score: number): BugFindingBand {
  if (!Number.isFinite(score)) return "getting there";
  if (score < BUG_FINDING_BAND_THRESHOLDS.still_learning_below) return "still learning";
  if (score > BUG_FINDING_BAND_THRESHOLDS.solid_above) return "solid";
  return "getting there";
}

// Humanized labels for the 8 bug archetypes. Source of truth for the card's row labels.
export const BUG_ARCHETYPE_LABELS: Record<BugArchetypeKey, string> = {
  off_by_one: "Off-by-one",
  mutation_in_iteration: "Mutation in iteration",
  reference_equality: "Reference equality",
  async_race: "Async race",
  late_binding: "Late binding",
  shadowing: "Shadowing",
  type_coercion: "Type coercion",
  default_arg_mutability: "Default-arg mutability",
};

export function humanizeBugArchetype(archetype: BugArchetypeKey): string {
  return BUG_ARCHETYPE_LABELS[archetype];
}
