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
export {
  bootstrapProfile,
  getProfileTargetRole,
  type BootstrapProfileOptions,
} from "./profile-bootstrap.js";
export {
  updateProfileFields,
  type ProfileFieldUpdatesInput,
  type UpdateProfileFieldsOptions,
} from "./profile-update.js";
export {
  findSessionUser,
  type FindSessionUserOptions,
  type SessionUser,
} from "./session-lookup.js";
export {
  drizzleExportFetcher,
  exportUserData,
  type ExportFetcher,
  type ExportUserDataOptions,
} from "./data-export.js";
export {
  DumpEnvelopeSchema,
  importDump,
  type DumpEnvelope,
  type ImportDumpOptions,
  type ImportDumpResult,
} from "./data-import.js";
export {
  deleteUserAccount,
  deleteUserVoiceTranscripts,
  getUserDataSummary,
  listRecentAgentCalls,
  type DeleteAccountResult,
  type UserDataSummary,
} from "./data-controls.js";
export {
  awardXp,
  consumeGraceDay,
  getActiveTrackSlugs,
  getStreakInputs,
  getStreakSnapshot,
  getTrackProgress,
  getUserXp,
  replenishGraceDays,
  type AwardXpInput,
  type AwardXpResult,
  type StreakInputs,
  type TrackProgress,
} from "./xp-streak.js";
export { countUserEpisodes, getTracksBySlugs, type TrackSummary } from "./tracks-query.js";
export {
  addWebPushSubscription,
  findRecentDuplicate,
  gcOldNotifications,
  listRecentNotifications,
  listWebPushSubscriptions,
  markAllRead,
  markRead,
  removeWebPushSubscription,
  unreadCount,
  type AddWebPushSubscriptionOptions,
  type FindRecentDuplicateOptions,
  type ListRecentNotificationsOptions,
  type MarkAllReadOptions,
  type MarkReadOptions,
} from "./notifications.js";
export {
  getQuietHoursConfig,
  updateQuietHoursConfig,
  type UpdateQuietHoursConfigOptions,
} from "./quiet-hours.js";
export {
  countClosedEpisodes,
  countSuccessfulEpisodes,
  getConfidenceSignal,
  updateConfidenceSignalRow,
  type UpdateConfidenceSignalRowOptions,
} from "./autonomy-signal.js";
export {
  DeferredPayloadSchema,
  deleteDeferredNotification,
  insertDeferredNotification,
  listDueDeferredNotifications,
  type DeferredPayload,
  type InsertDeferredNotificationOptions,
} from "./deferred-notifications.js";
export {
  sweepAll,
  sweepInteractionTelemetry,
  sweepRawLlmCalls,
  sweepVoiceTranscripts,
  type SweepAllResult,
  type SweepOptions,
} from "./retention.js";
export {
  DEFAULT_PLAN_TTL_HOURS,
  SessionPlanItemSchema,
  SessionPlanItemStatusSchema,
  SessionPlanItemsSchema,
  createPlan,
  getLatestActivePlan,
  markItemCompleted,
  rollOverPending,
  type CreatePlanInput,
  type SessionPlan,
  type SessionPlanItem,
  type SessionPlanItemStatus,
} from "./session-plan.js";
export {
  getCardState,
  getDueConcepts,
  recordReview,
  upsertCardState,
  withOverdueDays,
  type DueConceptRow,
  type DueConceptWithOverdue,
  type RecordReviewInput,
} from "./concept-reviews.js";
export {
  getEpisodeForPush,
  getPortfolioSettings,
  listRecentPushes,
  recordPush,
  updatePortfolioSettings,
  type PortfolioEpisodeContext,
  type PortfolioSettings,
  type RecordPushInput,
  type UpdatePortfolioSettingsOptions,
} from "./portfolio-store.js";
