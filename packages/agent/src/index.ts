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
  AssignProblemInsight,
  ComprehensionAnswerShape,
  ComprehensionGradeDeps,
  ComprehensionGradeDepsInput,
  ComprehensionGradeDepsResult,
  ComprehensionProblemDefShape,
  GiveHintDeps,
  GradeDeps,
  GradeRubric,
  GraderAgentRubric,
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
  ComprehensionDepsNotWiredError,
  ComprehensionGradeOutputSchema,
  GradeInputSchema,
  GradeInputShapeMismatchError,
  GradeOutputSchema,
  GradeRubricSchema,
  GraderAgentRubricSchema,
  aggregatePassed,
  clampRubric,
  createGradeTool,
  summarizeFailingTests,
  type ComprehensionGradeOutput,
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
  ComprehensionAnswerSchema,
  ComprehensionGradeResultSchema,
  gradeComprehension,
  parseComprehensionGraderResponse,
  type ComprehensionAnswer,
  type ComprehensionGradeInput,
  type ComprehensionGradeResult,
} from "./comprehension-grade.js";

export {
  DebugGradeResultSchema,
  parseDebugGraderResponse,
  runDebugGrader,
  type DebugGradeInput,
  type DebugGradeResult,
  type InferredArchetype,
} from "./debug-grade.js";

export {
  buildComprehensionCommentary,
  forbiddenPhrasesForCommentary,
  type ComprehensionCommentary,
  type ComprehensionCommentaryInput,
} from "./comprehension-commentary.js";

export {
  GRADER_BONUS_CLAMP,
  GRADER_BONUS_PER_DIMENSION,
  UpdateProfileEpisodeMissingError,
  UpdateProfileInputSchema,
  UpdateProfileOutputSchema,
  applyGraderBonus,
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
  buildWeeklyPlan,
  computeWeeklyDampeningReason,
  MIN_CONCEPTS_FOR_LLM_THEME,
  reasoningForDailyConcept,
  SUPPRESSED_REPLAN_ONE_DAY_WEEKLY,
  SUPPRESSED_REPLAN_WEEKEND_WEEKLY,
  WeeklyPlanDampeningSchema,
  WeeklyPlanDayConceptSchema,
  WeeklyPlanSchema,
  type BuildWeeklyPlanInput,
  type WeeklyPlan,
  type WeeklyPlanConceptGraph,
  type WeeklyPlanDampening,
  type WeeklyPlanDayConcept,
  type WeeklyPlanDueReview,
  type WeeklyPlanRecentEpisode,
  type WeeklyPlanThemeGenerator,
  type WeeklyPlanThemeGeneratorInput,
  type WeeklyPlanThemeGeneratorOutput,
} from "./weekly-plan.js";

export {
  generateWeeklyTheme,
  parseWeeklyThemeResponse,
  WEEKLY_THEME_FORBIDDEN_OUTPUT_SUBSTRINGS,
  WEEKLY_THEME_MAX_CHARS,
  WEEKLY_THEME_MAX_WORDS,
  type ConceptInfo as WeeklyThemeConceptInfo,
  type GenerateWeeklyThemeInput,
  type GenerateWeeklyThemeOutput,
} from "./weekly-theme.js";

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

export {
  MIN_EPISODES_FOR_SYNTHESIS,
  ProfileInsightSchema,
  ProfileInsightsResultSchema,
  containsForbiddenPhrase as containsForbiddenInsightPhrase,
  detectReferencedInsightIds,
  parseInsightsResponse,
  runProfileInsightsAgent,
  type ProfileInsightOutput,
  type ProfileInsightsAgentInput,
  type ProfileInsightsAgentOutput,
  type ProfileInsightsResult,
} from "./profile-insights.js";
export {
  CheatsheetAgentResultSchema,
  CheatsheetEntrySchema as CheatsheetAgentEntrySchema,
  DEFAULT_CHEATSHEET_MAX_ENTRIES,
  cheatsheetAgent,
  entriesToMarkdown,
  parseCheatsheetResponse,
  type CheatsheetAgentInput,
  type CheatsheetAgentResult,
  type CheatsheetEntry as CheatsheetAgentEntry,
} from "./cheatsheet.js";
export {
  generateProblemVariant,
  parseProblemVariantResponse,
  type GenerateProblemVariantInput,
  type GenerateProblemVariantOutput,
} from "./problem-variants.js";
