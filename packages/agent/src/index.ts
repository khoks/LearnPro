export const PACKAGE_NAME = "@learnpro/agent";

export {
  TutorPhaseSchema,
  TutorStateSchema,
  HintRungSchema,
  HintRecordSchema,
  FinalOutcomeSchema,
  IllegalTransitionError,
  difficultyToTier,
  tierIncludesDifficulty,
  type TutorPhase,
  type TutorState,
  type HintRung,
  type HintRecord,
  type FinalOutcome,
} from "./state.js";

export type {
  AssignProblemDeps,
  GiveHintDeps,
  GradeDeps,
  GradeRubric,
  HiddenTestResult,
  HintEpisodeContext,
  GradeEpisodeContext,
  ProblemCatalogEntry,
  RecentEpisode,
  UpdateProfileDeps,
  UpdateProfileEpisodeContext,
} from "./ports.js";

export {
  AssignProblemInputSchema,
  AssignProblemOutputSchema,
  NoEligibleProblemError,
  createAssignProblemTool,
  pickCandidate,
  pickDifficultyTier,
  type AssignProblemInput,
  type AssignProblemOutput,
  type AssignProblemTool,
  type CreateAssignProblemToolOptions,
} from "./tools/assign-problem.js";
