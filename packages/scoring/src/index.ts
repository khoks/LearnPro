export const PACKAGE_NAME = "@learnpro/scoring";

export * from "./policies/index.js";
export {
  ComprehensionAnswerFormatSchema,
  ComprehensionEpisodeSignalInputSchema,
  ComprehensionHeuristicConfigSchema,
  ComprehensionMcSuccessConfigSchema,
  DEFAULT_COMPREHENSION_EXPECTED_TIME_SEC,
  DEFAULT_COMPREHENSION_HEURISTIC,
  DEFAULT_DIFFICULTY_HEURISTIC,
  DifficultyHeuristicConfigSchema,
  EpisodeSignalInputSchema,
  TIER_ORDER,
  comprehensionDifficultySignal,
  comprehensionEpisodeSuccessScore,
  difficultySignal,
  episodeSuccessScore,
  nextComprehensionDifficulty,
  nextDifficulty,
  updateSkillScore,
  type ComprehensionAnswerFormatForScoring,
  type ComprehensionEpisodeSignalInput,
  type ComprehensionHeuristicConfig,
  type ComprehensionMcSuccessConfig,
  type DifficultyHeuristicConfig,
  type EpisodeSignalInput,
} from "./difficulty.js";
