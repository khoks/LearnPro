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
  PlanSessionDeps,
  PlanSessionGenerateInput,
  PlanSessionGenerateOutput,
  PlanSessionRecentEpisode,
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
  GradeAgentResultSchema,
  GraderRubricSchema,
  RubricScoreSchema,
  gradeAgent,
  parseGraderResponse,
  summarizeFailing as summarizeFailingForGrader,
  type GradeAgentEpisode,
  type GradeAgentInput,
  type GradeAgentResult,
  type GraderRubric,
  type RubricScore,
} from "./grade.js";

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
  PlanSessionInputSchema,
  PlanSessionItemSchema,
  PlanSessionOutputSchema,
  createPlanSessionTool,
  deterministicFallbackItems,
  parsePlanItems,
  truncateToBudget,
  type CreatePlanSessionToolOptions,
  type PlanSessionInput,
  type PlanSessionItem,
  type PlanSessionOutput,
  type PlanSessionTool,
} from "./tools/plan-session.js";

export {
  buildTodayPlan,
  computeDampeningReason,
  reasoningForPlanItem,
  reasoningForReview,
  SUPPRESSED_REPLAN_ONE_DAY,
  SUPPRESSED_REPLAN_WEEKEND,
  TodayPlanDampeningSchema,
  TodayPlanSchema,
  TodayReviewItemSchema,
  TodaySessionPlanItemSchema,
  type BuildTodayPlanInput,
  type TodayPlan,
  type TodayPlanDampening,
  type TodayPlanDeps,
  type TodayReviewItem,
  type TodaySessionPlanItem,
} from "./today-plan.js";

export {
  AUTONOMY_ACTION_CONSEQUENCE,
  TutorSession,
  type AutonomyActionKind,
  type AutonomyAdvice,
  type TutorSessionOptions,
  type TutorSessionTools,
} from "./tutor-session.js";

export {
  buildAssignProblemDrizzleDeps,
  buildGiveHintDrizzleDeps,
  buildGradeDrizzleDeps,
  buildUpdateProfileDrizzleDeps,
  loadEpisodeProblemRow,
  type BuildDrizzleAgentDepsOptions,
} from "./drizzle-deps.js";
