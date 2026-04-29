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
export {
  DrizzleLLMTelemetrySink,
  type DrizzleLLMTelemetrySinkOptions,
} from "./llm-telemetry-sink.js";
export { DrizzleUsageStore, type DrizzleUsageStoreOptions } from "./llm-usage-store.js";
export {
  DrizzleInteractionStore,
  type DrizzleInteractionStoreOptions,
} from "./interaction-store.js";
export { bootstrapProfile, type BootstrapProfileOptions } from "./profile-bootstrap.js";
export {
  findSessionUser,
  type FindSessionUserOptions,
  type SessionUser,
} from "./session-lookup.js";
