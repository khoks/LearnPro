export const PACKAGE_NAME = "@learnpro/db";

export * from "./schema.js";
export * from "./relations.js";
export { createDb, loadDatabaseUrl, type CreateDbOptions, type LearnProDb } from "./client.js";
export { runMigrations } from "./migrate.js";
export {
  DEMO_CONCEPT_ID,
  DEMO_EPISODE_ID,
  DEMO_ORG_ID,
  DEMO_PROBLEM_ID,
  DEMO_TRACK_ID,
  DEMO_USER_ID,
  runSeedFromEnv,
  seedDemo,
  type SeedResult,
} from "./seed.js";
