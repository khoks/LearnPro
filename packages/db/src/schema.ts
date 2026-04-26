import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
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

export const organizations = pgTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  created_at: createdAt(),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    org_id: orgId(),
    email: text("email").notNull(),
    github_id: text("github_id"),
    created_at: createdAt(),
  },
  (t) => ({
    email_uniq: uniqueIndex("users_email_uniq").on(t.org_id, t.email),
    github_uniq: uniqueIndex("users_github_uniq").on(t.github_id),
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
  },
  (t) => ({
    user_started_idx: index("episodes_user_started_idx").on(t.user_id, t.started_at),
    problem_idx: index("episodes_problem_idx").on(t.problem_id),
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
    episode_id: uuid("episode_id").references(() => episodes.id, { onDelete: "set null" }),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    role: agentRoleEnum("role"),
    prompt_version: text("prompt_version"),
    input_tokens: integer("input_tokens").notNull().default(0),
    output_tokens: integer("output_tokens").notNull().default(0),
    latency_ms: integer("latency_ms").notNull().default(0),
    ok: boolean("ok").notNull().default(true),
    called_at: timestamp("called_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    user_called_idx: index("agent_calls_user_called_idx").on(t.user_id, t.called_at),
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
export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;

export const ALL_TABLES = [
  organizations,
  users,
  profiles,
  concepts,
  skill_scores,
  tracks,
  problems,
  episodes,
  submissions,
  agent_calls,
  notifications,
] as const;

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
  notifications,
] as const;

export const PGVECTOR_PROLOGUE_SQL = sql`CREATE EXTENSION IF NOT EXISTS vector`;
