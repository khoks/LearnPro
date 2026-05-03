export const PACKAGE_NAME = "@learnpro/problems";

export {
  ConceptTagSchema,
  HiddenTestSchema,
  ProblemDefSchema,
  ProblemDifficultySchema,
  ProblemLanguageSchema,
  ProblemSlugSchema,
  PublicExampleSchema,
  TestCaseValueSchema,
  type HiddenTest,
  type ProblemDef,
  type ProblemDifficulty,
  type ProblemLanguage,
  type PublicExample,
} from "./schema.js";

export {
  loadProblems,
  PROBLEMS_ROOT,
  seedProblems,
  type LoadProblemsOptions,
  type SeedProblemsOptions,
  type SeedProblemsResult,
} from "./loader.js";

export {
  validateProblem,
  validateProblems,
  type ProblemValidationFailure,
  type ProblemValidationResult,
  type ValidateProblemsOptions,
} from "./validate.js";

export {
  VERDICT_PASS_TOKEN,
  VERDICT_FAIL_TOKEN,
  buildHarness,
  buildHarnessForProblem,
  parseVerdict,
  type BuildHarnessOptions,
  type Verdict,
} from "./harness.js";
