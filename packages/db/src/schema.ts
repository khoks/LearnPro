import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

export const SELF_HOSTED_ORG_ID = "self";

const orgId = () => text("org_id").notNull().default(SELF_HOSTED_ORG_ID);

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const finalOutcomeEnum = pgEnum("episode_outcome", [
  "passed",
  "passed_with_hints",
  "failed",
  "abandoned",
  "revealed",
]);

export const notificationChannelEnum = pgEnum("notification_channel", [
  "in_app",
  "web_push",
  "email",
  "whatsapp",
]);

export const agentRoleEnum = pgEnum("agent_role", [
  "tutor",
  "interviewer",
  "reflection",
  "grader",
  "router",
]);

export const submissionLanguageEnum = pgEnum("submission_language", ["python", "typescript"]);

// Mirrors `LLMTelemetryEvent.task` in @learnpro/llm — the four entry points the gateway exposes.
export const agentTaskEnum = pgEnum("agent_task", ["complete", "stream", "embed", "tool_call"]);

// Mirrors `InteractionType` in @learnpro/shared — the 9 event kinds the client can emit.
export const interactionTypeEnum = pgEnum("interaction_type", [
  "cursor_focus",
  "voice",
  "edit",
  "revert",
  "run",
  "submit",
  "hint_request",
  "hint_received",
  "autonomy_decision",
]);

export const organizations = pgTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  created_at: createdAt(),
});

// Columns named to match `@auth/drizzle-adapter`'s default Postgres schema (`name`, `emailVerified`,
// `image`) so the adapter writes through without a custom mapping. `org_id` / `github_id` /
// `created_at` are LearnPro-specific extensions; the adapter ignores them.
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    org_id: orgId(),
    email: text("email").notNull(),
    name: text("name"),
    emailVerified: timestamp("emailVerified", { mode: "date", withTimezone: true }),
    image: text("image"),
    github_id: text("github_id"),
    created_at: createdAt(),
  },
  (t) => ({
    email_uniq: uniqueIndex("users_email_uniq").on(t.org_id, t.email),
    github_uniq: uniqueIndex("users_github_uniq").on(t.github_id),
  }),
);

// `@auth/drizzle-adapter` Postgres tables. Column names + types must match exactly so the
// adapter works without a custom mapping. See https://authjs.dev/getting-started/adapters/drizzle.
export const accounts = pgTable(
  "accounts",
  {
    userId: uuid("userId")
      .notNull()
      .references((): AnyPgColumn => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.provider, t.providerAccountId] }),
  }),
);

export const sessions = pgTable("sessions", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: uuid("userId")
    .notNull()
    .references((): AnyPgColumn => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date", withTimezone: true }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationTokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date", withTimezone: true }).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.identifier, t.token] }),
  }),
);

export const profiles = pgTable("profiles", {
  user_id: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  org_id: orgId(),
  target_role: text("target_role"),
  time_budget_min: integer("time_budget_min"),
  primary_goal: text("primary_goal"),
  self_assessed_level: text("self_assessed_level"),
  language_comfort: jsonb("language_comfort"),
  updated_at: updatedAt(),
});

export const concepts = pgTable(
  "concepts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    org_id: orgId(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    language: text("language").notNull(),
    parent_concept_id: uuid("parent_concept_id"),
    created_at: createdAt(),
  },
  (t) => ({
    slug_uniq: uniqueIndex("concepts_slug_lang_uniq").on(t.org_id, t.language, t.slug),
    parent_idx: index("concepts_parent_idx").on(t.parent_concept_id),
  }),
);

export const skill_scores = pgTable(
  "skill_scores",
  {
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    concept_id: uuid("concept_id")
      .notNull()
      .references(() => concepts.id, { onDelete: "cascade" }),
    org_id: orgId(),
    score: integer("score").notNull().default(0),
    confidence: integer("confidence").notNull().default(0),
    last_practiced_at: timestamp("last_practiced_at", { withTimezone: true }),
    updated_at: updatedAt(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.user_id, t.concept_id] }),
    user_idx: index("skill_scores_user_idx").on(t.user_id),
  }),
);

export const tracks = pgTable(
  "tracks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    org_id: orgId(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    language: submissionLanguageEnum("language").notNull(),
    description: text("description"),
    created_at: createdAt(),
  },
  (t) => ({
    slug_uniq: uniqueIndex("tracks_slug_uniq").on(t.org_id, t.slug),
  }),
);

export const problems = pgTable(
  "problems",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    org_id: orgId(),
    track_id: uuid("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    language: submissionLanguageEnum("language").notNull(),
    difficulty: text("difficulty").notNull(),
    statement: text("statement").notNull(),
    starter_code: text("starter_code"),
    hidden_tests: jsonb("hidden_tests").notNull(),
    created_at: createdAt(),
  },
  (t) => ({
    slug_uniq: uniqueIndex("problems_slug_uniq").on(t.org_id, t.track_id, t.slug),
  }),
);

export const episodes = pgTable(
  "episodes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    org_id: orgId(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    problem_id: uuid("problem_id")
      .notNull()
      .references(() => problems.id, { onDelete: "restrict" }),
    started_at: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finished_at: timestamp("finished_at", { withTimezone: true }),
    hints_used: integer("hints_used").notNull().default(0),
    attempts: integer("attempts").notNull().default(0),
    final_outcome: finalOutcomeEnum("final_outcome"),
    time_to_solve_ms: bigint("time_to_solve_ms", { mode: "number" }),
    embedding: vector("embedding", { dimensions: 1536 }),
    interactions_summary: jsonb("interactions_summary"),
  },
  (t) => ({
    user_started_idx: index("episodes_user_started_idx").on(t.user_id, t.started_at),
    problem_idx: index("episodes_problem_idx").on(t.problem_id),
    embedding_ivfflat_idx: index("episodes_embedding_ivfflat_idx")
      .using("ivfflat", t.embedding.op("vector_cosine_ops"))
      .with({ lists: 100 }),
  }),
);

export const submissions = pgTable(
  "submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    org_id: orgId(),
    episode_id: uuid("episode_id")
      .notNull()
      .references(() => episodes.id, { onDelete: "cascade" }),
    submitted_at: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    code: text("code").notNull(),
    passed: boolean("passed").notNull(),
    runtime_ms: integer("runtime_ms"),
  },
  (t) => ({
    episode_idx: index("submissions_episode_idx").on(t.episode_id),
  }),
);

export const agent_calls = pgTable(
  "agent_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    org_id: orgId(),
    user_id: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    session_id: text("session_id"),
    episode_id: uuid("episode_id").references(() => episodes.id, { onDelete: "set null" }),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    role: agentRoleEnum("role"),
    task: agentTaskEnum("task").notNull().default("complete"),
    prompt_version: text("prompt_version"),
    input_tokens: integer("input_tokens").notNull().default(0),
    output_tokens: integer("output_tokens").notNull().default(0),
    cached_tokens: integer("cached_tokens"),
    cost_usd: numeric("cost_usd", { precision: 18, scale: 8 }).notNull().default("0"),
    pricing_version: text("pricing_version").notNull().default("unknown"),
    tool_used: text("tool_used"),
    latency_ms: integer("latency_ms").notNull().default(0),
    ok: boolean("ok").notNull().default(true),
    called_at: timestamp("called_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    user_called_idx: index("agent_calls_user_called_idx").on(t.user_id, t.called_at),
  }),
);

export const interactions = pgTable(
  "interactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    org_id: orgId(),
    user_id: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    episode_id: uuid("episode_id").references(() => episodes.id, { onDelete: "cascade" }),
    type: interactionTypeEnum("type").notNull(),
    payload: jsonb("payload").notNull(),
    t: timestamp("t", { withTimezone: true }).notNull().defaultNow(),
    created_at: createdAt(),
  },
  (table) => ({
    episode_t_idx: index("interactions_episode_t_idx").on(table.episode_id, table.t),
    user_t_idx: index("interactions_user_t_idx").on(table.user_id, table.t),
  }),
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    org_id: orgId(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    channel: notificationChannelEnum("channel").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    sent_at: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    read_at: timestamp("read_at", { withTimezone: true }),
  },
  (t) => ({
    user_sent_idx: index("notifications_user_sent_idx").on(t.user_id, t.sent_at),
  }),
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type VerificationToken = typeof verificationTokens.$inferSelect;
export type NewVerificationToken = typeof verificationTokens.$inferInsert;
export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
export type Concept = typeof concepts.$inferSelect;
export type NewConcept = typeof concepts.$inferInsert;
export type SkillScore = typeof skill_scores.$inferSelect;
export type NewSkillScore = typeof skill_scores.$inferInsert;
export type Episode = typeof episodes.$inferSelect;
export type NewEpisode = typeof episodes.$inferInsert;
export type Track = typeof tracks.$inferSelect;
export type NewTrack = typeof tracks.$inferInsert;
export type Problem = typeof problems.$inferSelect;
export type NewProblem = typeof problems.$inferInsert;
export type Submission = typeof submissions.$inferSelect;
export type NewSubmission = typeof submissions.$inferInsert;
export type AgentCall = typeof agent_calls.$inferSelect;
export type NewAgentCall = typeof agent_calls.$inferInsert;
export type Interaction = typeof interactions.$inferSelect;
export type NewInteraction = typeof interactions.$inferInsert;
export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;

export const ALL_TABLES = [
  organizations,
  users,
  accounts,
  sessions,
  verificationTokens,
  profiles,
  concepts,
  skill_scores,
  tracks,
  problems,
  episodes,
  submissions,
  agent_calls,
  interactions,
  notifications,
] as const;

// Auth.js tables (`accounts`, `sessions`, `verificationTokens`) are intentionally NOT in this
// list — their column names are fixed by the adapter contract and they don't carry `org_id`.
// Tenant attribution for an Auth.js-created user happens via the `users.org_id` row.
export const ORG_SCOPED_TABLES = [
  users,
  profiles,
  concepts,
  skill_scores,
  tracks,
  problems,
  episodes,
  submissions,
  agent_calls,
  interactions,
  notifications,
] as const;

export const PGVECTOR_PROLOGUE_SQL = sql`CREATE EXTENSION IF NOT EXISTS vector`;
