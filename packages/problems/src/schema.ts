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

export const ProblemDefSchema = z.object({
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
});
export type ProblemDef = z.infer<typeof ProblemDefSchema>;
