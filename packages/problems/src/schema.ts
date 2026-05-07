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
// strength. STORY-038 extends the discriminator with `"comprehension"`; new archetypes for future
// stories should be added here (and to the corresponding pgEnum in 0018_debug_problems.sql).
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

// STORY-037 / STORY-038 — `kind` discriminator. The discriminated union below uses `kind` so adding
// a new variant only adds a Zod object to the union, leaving the existing variants untouched. The
// legacy "implement" shape (no `kind` field on disk) is normalized at parse time via
// `ProblemDefSchema.preprocess` below — back-compat is mechanical, not optional.
export const ProblemKindSchema = z.enum(["implement", "debug", "comprehension"]);
export type ProblemKind = z.infer<typeof ProblemKindSchema>;

// STORY-038 — comprehension sub-formats. Predict-the-output, trace-execution-state, and
// reason-about-properties (complexity / why-it-works / where-to-cache).
export const ComprehensionFormatSchema = z.enum([
  "predict_output",
  "trace_execution",
  "reason_property",
]);
export type ComprehensionFormat = z.infer<typeof ComprehensionFormatSchema>;

const baseProblemFields = {
  slug: ProblemSlugSchema,
  name: z.string().min(1),
  language: ProblemLanguageSchema,
  difficulty: ProblemDifficultySchema,
  track: ProblemSlugSchema,
  concept_tags: z.array(ConceptTagSchema).min(1),
  statement: z.string().min(1),
  starter_code: z.string().min(1),
  expected_median_time_to_solve_ms: z.number().int().positive(),
} as const;

// Implement / debug problems carry `reference_solution`, `public_examples` and a non-empty
// `hidden_tests` array — they're code-execution problems. The comprehension branch below skips
// those fields entirely (they're meaningless for "predict the output") and only requires the
// answer-shape fields.
const codingProblemFields = {
  ...baseProblemFields,
  reference_solution: z.string().min(1),
  public_examples: z.array(PublicExampleSchema).min(1),
  hidden_tests: z.array(HiddenTestSchema).min(1),
} as const;

// STORY-043 — multi-file starter workspace. When present (implement-kind only), the editor
// pre-populates with this file tree instead of `starter_code`.  `starter_code` stays required
// for backward compat: if the user clicks "single-file mode" or the loader downgrades the
// problem the legacy single-file shape still works.  `entry_file` defaults to the
// per-language entry filename (main.py / index.ts) when omitted.
//
// Path validation matches the sandbox's `SandboxWorkspaceFileSchema` so a workspace authored
// in problem YAML can be shipped directly into a `POST /sandbox/run` body.
const WORKSPACE_PATH = /^(?!\/)(?!.*\.\.)[A-Za-z0-9_./-]+$/;
export const StarterWorkspaceFileSchema = z.object({
  path: z
    .string()
    .min(1)
    .max(256)
    .regex(WORKSPACE_PATH, "starter_workspace path must be a forward-slash POSIX path"),
  content: z.string(),
});
export type StarterWorkspaceFile = z.infer<typeof StarterWorkspaceFileSchema>;

export const ImplementProblemDefSchema = z.object({
  kind: z.literal("implement"),
  ...codingProblemFields,
  starter_workspace: z.array(StarterWorkspaceFileSchema).min(1).max(64).optional(),
  entry_file: z.string().min(1).optional(),
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
  ...codingProblemFields,
  bug_archetype: BugArchetypeSchema,
  expected_behavior: z.string().min(1),
});
export type DebugProblemDef = z.infer<typeof DebugProblemDefSchema>;

// STORY-038 — comprehension problem. The editor renders `starter_code` READ-ONLY (Monaco's
// `readOnly: true`); below it the UI shows `question` plus an answer widget chosen by
// `answer_format` (multiple-choice radio buttons or a free-text textarea). `correct_answer_index`
// is required for multiple-choice; `expected_answer` is required for free-text. `explanation` is
// the 1-3 sentence prose used by the tutor's after-correct commentary.
//
// Why no `hidden_tests` / `reference_solution` / `public_examples`: there is nothing for the
// sandbox to run — the user is reading code, not writing it. The seed bank validator + harness
// short-circuit on `kind === "comprehension"`.
//
// Why one schema (not a nested discriminator on `answer_format`): Zod's discriminated union
// can't nest on the same parent key, and z.discriminatedUnion("answer_format", ...) inside the
// `kind` union confuses the union resolver. A single z.object + a refinement that enforces the
// per-`answer_format` field requirements gives us the same parse-time guarantees with cleaner
// type inference at the call site.
export const ComprehensionProblemDefSchema = z
  .object({
    kind: z.literal("comprehension"),
    ...baseProblemFields,
    comprehension_format: ComprehensionFormatSchema,
    question: z.string().min(1),
    answer_format: z.enum(["multiple_choice", "free_text"]),
    multiple_choice_options: z.array(z.string().min(1)).length(4).optional(),
    correct_answer_index: z.number().int().min(0).max(3).optional(),
    expected_answer: z.string().min(1).optional(),
    explanation: z.string().min(1),
  })
  .superRefine((val, ctx) => {
    if (val.answer_format === "multiple_choice") {
      if (!val.multiple_choice_options) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["multiple_choice_options"],
          message: "multiple_choice_options is required when answer_format = 'multiple_choice'",
        });
      }
      if (val.correct_answer_index === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["correct_answer_index"],
          message: "correct_answer_index is required when answer_format = 'multiple_choice'",
        });
      }
      if (
        val.multiple_choice_options &&
        val.correct_answer_index !== undefined &&
        val.correct_answer_index >= val.multiple_choice_options.length
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["correct_answer_index"],
          message: "correct_answer_index must index into multiple_choice_options",
        });
      }
    } else {
      if (!val.expected_answer) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["expected_answer"],
          message: "expected_answer is required when answer_format = 'free_text'",
        });
      }
    }
  });
export type ComprehensionProblemDef = z.infer<typeof ComprehensionProblemDefSchema>;

const DiscriminatedProblemDefSchema = z.discriminatedUnion("kind", [
  ImplementProblemDefSchema,
  DebugProblemDefSchema,
  // Plain z.object form (not the refined wrapper) so the discriminated-union resolver can pull
  // the `kind` literal cleanly. The refinement runs on the wrapper above; we re-apply it here so
  // the parsed `ProblemDef` always passes the per-`answer_format` checks.
  z.object({
    kind: z.literal("comprehension"),
    ...baseProblemFields,
    comprehension_format: ComprehensionFormatSchema,
    question: z.string().min(1),
    answer_format: z.enum(["multiple_choice", "free_text"]),
    multiple_choice_options: z.array(z.string().min(1)).length(4).optional(),
    correct_answer_index: z.number().int().min(0).max(3).optional(),
    expected_answer: z.string().min(1).optional(),
    explanation: z.string().min(1),
  }),
]);

// On-disk YAMLs for "implement" problems do not carry a `kind` field (and we don't want to bulk-
// rewrite all 63 of them). Normalize at parse time: missing `kind` → `"implement"`. The trailing
// superRefine re-applies (1) the per-`answer_format` rule for comprehension problems and
// (2) the STORY-043 starter_workspace duplicate-path / entry_file checks for implement problems.
// Both refinements are stacked here because z.discriminatedUnion requires plain objects to
// extract the discriminator literal cleanly — the refinements live on the post-union schema.
export const ProblemDefSchema = z
  .preprocess((raw) => {
    if (raw && typeof raw === "object" && !Array.isArray(raw) && !("kind" in raw)) {
      return { ...(raw as Record<string, unknown>), kind: "implement" };
    }
    return raw;
  }, DiscriminatedProblemDefSchema)
  .superRefine((val, ctx) => {
    // STORY-038 — comprehension answer-format rules.
    if (val.kind === "comprehension") {
      if (val.answer_format === "multiple_choice") {
        if (!val.multiple_choice_options) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["multiple_choice_options"],
            message: "multiple_choice_options is required when answer_format = 'multiple_choice'",
          });
        }
        if (val.correct_answer_index === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["correct_answer_index"],
            message: "correct_answer_index is required when answer_format = 'multiple_choice'",
          });
        }
        if (
          val.multiple_choice_options &&
          val.correct_answer_index !== undefined &&
          val.correct_answer_index >= val.multiple_choice_options.length
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["correct_answer_index"],
            message: "correct_answer_index must index into multiple_choice_options",
          });
        }
      } else if (val.answer_format === "free_text") {
        if (!val.expected_answer) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["expected_answer"],
            message: "expected_answer is required when answer_format = 'free_text'",
          });
        }
      }
      return;
    }
    // STORY-043 — implement-only: starter_workspace duplicate-path + entry_file check.
    if (val.kind === "implement" && val.starter_workspace) {
      const seen = new Set<string>();
      for (let i = 0; i < val.starter_workspace.length; i++) {
        const p = val.starter_workspace[i]!.path;
        if (seen.has(p)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["starter_workspace", i, "path"],
            message: `duplicate path: ${p}`,
          });
        }
        seen.add(p);
      }
      if (val.entry_file && !seen.has(val.entry_file)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["entry_file"],
          message: `entry_file '${val.entry_file}' is not present in starter_workspace[]`,
        });
      }
    }
  });

export type ProblemDef = z.infer<typeof ProblemDefSchema>;

export function isDebugProblem(def: ProblemDef): def is DebugProblemDef {
  return def.kind === "debug";
}

export function isImplementProblem(def: ProblemDef): def is ImplementProblemDef {
  return def.kind === "implement";
}

export function isComprehensionProblem(def: ProblemDef): def is ComprehensionProblemDef {
  return def.kind === "comprehension";
}
