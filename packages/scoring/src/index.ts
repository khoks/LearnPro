export const PACKAGE_NAME = "@learnpro/scoring";

export * from "./policies/index.js";
export {
  DEFAULT_DIFFICULTY_HEURISTIC,
  DifficultyHeuristicConfigSchema,
  EpisodeSignalInputSchema,
  TIER_ORDER,
  difficultySignal,
  episodeSuccessScore,
  nextDifficulty,
  updateSkillScore,
  type DifficultyHeuristicConfig,
  type EpisodeSignalInput,
} from "./difficulty.js";
