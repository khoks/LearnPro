export const PACKAGE_NAME = "@learnpro/problems";

export {
  BugArchetypeSchema,
  ComprehensionFormatSchema,
  ComprehensionProblemDefSchema,
  ConceptTagSchema,
  DebugProblemDefSchema,
  HiddenTestSchema,
  ImplementProblemDefSchema,
  ProblemDefSchema,
  ProblemDifficultySchema,
  ProblemKindSchema,
  ProblemLanguageSchema,
  ProblemSlugSchema,
  PublicExampleSchema,
  TestCaseValueSchema,
  isComprehensionProblem,
  isDebugProblem,
  isImplementProblem,
  type BugArchetype,
  type ComprehensionFormat,
  type ComprehensionProblemDef,
  type DebugProblemDef,
  type HiddenTest,
  type ImplementProblemDef,
  type ProblemDef,
  type ProblemDifficulty,
  type ProblemKind,
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
