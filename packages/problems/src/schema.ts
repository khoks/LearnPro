import { z } from "zod";

export const ProblemLanguageSchema = z.enum(["python", "typescript"]);
export type ProblemLanguage = z.infer<typeof ProblemLanguageSchema>;

export const ProblemDifficultySchema = z.number().int().min(1).max(5);
export type ProblemDifficulty = z.infer<typeof ProblemDifficultySchema>;

const KEBAB_CASE = /^[a-z][a-z0-9-]*[a-z0-9]$|^[a-z]$/;

export const ConceptTagSchema = z
  .string()
  .min(1)
  .regex(KEBAB_CASE, "concept tag must be lowercase kebab-case");

export const ProblemSlugSchema = z
  .string()
  .min(1)
  .regex(KEBAB_CASE, "problem slug must be lowercase kebab-case");

export const TestCaseValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(TestCaseValueSchema),
    z.record(TestCaseValueSchema),
  ]),
);

export const PublicExampleSchema = z.object({
  input: TestCaseValueSchema,
  expected: TestCaseValueSchema,
});
export type PublicExample = z.infer<typeof PublicExampleSchema>;

export const HiddenTestSchema = z.object({
  input: TestCaseValueSchema,
  expected: TestCaseValueSchema,
  weight: z.number().positive().optional(),
});
export type HiddenTest = z.infer<typeof HiddenTestSchema>;

// STORY-037 — bug-archetype catalog. Each debug problem flags exactly one of these so the tutor
// commentary phase can recognize "the bug was X because Y" and the profile can track per-archetype
// strength. STORY-038 will extend the discriminator with `"comprehension"`; new archetypes for
// future stories should be added here (and to the corresponding pgEnum in 0018_debug_problems.sql).
export const BugArchetypeSchema = z.enum([
  "off_by_one",
  "mutation_in_iteration",
  "reference_equality",
  "async_race",
  "late_binding",
  "shadowing",
  "type_coercion",
  "default_arg_mutability",
]);
export type BugArchetype = z.infer<typeof BugArchetypeSchema>;

// STORY-037 — `kind` discriminator. STORY-038 will land `"comprehension"`. The discriminated
// union below uses `kind` so adding a new variant only adds a Zod object to the union, leaving the
// existing variants untouched. The legacy "implement" shape (no `kind` field on disk) is normalized
// at parse time via `ProblemDefSchema.preprocess` below — back-compat is mechanical, not optional.
export const ProblemKindSchema = z.enum(["implement", "debug"]);
export type ProblemKind = z.infer<typeof ProblemKindSchema>;

const baseProblemFields = {
  slug: ProblemSlugSchema,
  name: z.string().min(1),
  language: ProblemLanguageSchema,
  difficulty: ProblemDifficultySchema,
  track: ProblemSlugSchema,
  concept_tags: z.array(ConceptTagSchema).min(1),
  statement: z.string().min(1),
  starter_code: z.string().min(1),
  reference_solution: z.string().min(1),
  public_examples: z.array(PublicExampleSchema).min(1),
  hidden_tests: z.array(HiddenTestSchema).min(1),
  expected_median_time_to_solve_ms: z.number().int().positive(),
} as const;

export const ImplementProblemDefSchema = z.object({
  kind: z.literal("implement"),
  ...baseProblemFields,
});
export type ImplementProblemDef = z.infer<typeof ImplementProblemDefSchema>;

// Debug problem shape:
//   - `starter_code` is the BUGGY code (pre-populated in the editor).
//   - `bug_archetype` flags the single archetype the bug exemplifies.
//   - `expected_behavior` is a 1-3 sentence prose statement of what the code SHOULD do.
//   - `hidden_tests` currently fail on the buggy code, pass after the fix.
//   - `reference_solution` is the FIXED solve() code (kept for parity with implement: the validator
//     uses it to verify the tests pass once the bug is removed).
export const DebugProblemDefSchema = z.object({
  kind: z.literal("debug"),
  ...baseProblemFields,
  bug_archetype: BugArchetypeSchema,
  expected_behavior: z.string().min(1),
});
export type DebugProblemDef = z.infer<typeof DebugProblemDefSchema>;

const DiscriminatedProblemDefSchema = z.discriminatedUnion("kind", [
  ImplementProblemDefSchema,
  DebugProblemDefSchema,
]);

// On-disk YAMLs for "implement" problems do not carry a `kind` field (and we don't want to bulk-
// rewrite all 63 of them). Normalize at parse time: missing `kind` → `"implement"`.
export const ProblemDefSchema = z.preprocess((raw) => {
  if (raw && typeof raw === "object" && !Array.isArray(raw) && !("kind" in raw)) {
    return { ...(raw as Record<string, unknown>), kind: "implement" };
  }
  return raw;
}, DiscriminatedProblemDefSchema);

export type ProblemDef = z.infer<typeof ProblemDefSchema>;

export function isDebugProblem(def: ProblemDef): def is DebugProblemDef {
  return def.kind === "debug";
}

export function isImplementProblem(def: ProblemDef): def is ImplementProblemDef {
  return def.kind === "implement";
}
