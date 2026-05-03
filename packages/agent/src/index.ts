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

export {
  EpisodeNotFoundError,
  GiveHintInputSchema,
  GiveHintOutputSchema,
  appendHint,
  createGiveHintTool,
  xpCostForRung,
  type CreateGiveHintToolOptions,
  type GiveHintInput,
  type GiveHintOutput,
  type GiveHintTool,
} from "./tools/give-hint.js";

export {
  GradeInputSchema,
  GradeOutputSchema,
  GradeRubricSchema,
  aggregatePassed,
  clampRubric,
  createGradeTool,
  summarizeFailingTests,
  type CreateGradeToolOptions,
  type GradeInput,
  type GradeOutput,
  type GradeTool,
} from "./tools/grade.js";

export {
  UpdateProfileEpisodeMissingError,
  UpdateProfileInputSchema,
  UpdateProfileOutputSchema,
  coldStartSkill,
  createUpdateProfileTool,
  deriveFinalOutcome,
  type CreateUpdateProfileToolOptions,
  type UpdateProfileInput,
  type UpdateProfileOutput,
  type UpdateProfileTool,
} from "./tools/update-profile.js";

export {
  TutorSession,
  type TutorSessionOptions,
  type TutorSessionTools,
} from "./tutor-session.js";
