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
    // Lifetime XP — incremented atomically alongside an `xp_awards` row insert. STORY-022 awards
    // XP only on episode close; future grants (e.g. badges) wire through the same helper.
    xp: integer("xp").notNull().default(0),
    // Streak shield budget. Refilled to `monthly_grace_days` (default 2) on the first read in a
    // new UTC month — the lazy-replenishment lives in `replenishGraceDays()` in xp-streak.ts.
    streak_grace_days_remaining: integer("streak_grace_days_remaining").notNull().default(2),
    // UTC month-start of the most recent grace-day replenishment. Null until the first replenish
    // call lands; xp-streak's lazy refill is the only writer.
    streak_grace_last_replenished_at: timestamp("streak_grace_last_replenished_at", {
      withTimezone: true,
    }),
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
  // STORY-024 — user-configurable quiet hours. Default window 22:00 → 08:00 in the user's local
  // timezone. The dispatcher checks `isInQuietHours()` before sending; in-window dispatches are
  // deferred (written to deferred_notifications) — never dropped (anti-dark-pattern).
  quiet_hours_enabled: boolean("quiet_hours_enabled").notNull().default(true),
  quiet_hours_start_min: integer("quiet_hours_start_min").notNull().default(1320),
  quiet_hours_end_min: integer("quiet_hours_end_min").notNull().default(480),
  // IANA zone string ("America/Los_Angeles", etc.). Stored as text — never as a UTC offset, since
  // offsets break across DST transitions.
  timezone: text("timezone").notNull().default("UTC"),
  // STORY-054 — adaptive autonomy controller. Per-user EWMA over (agreement_rate, engagement,
  // success) plus episode-count snapshot. Null until the first close lands; the controller's
  // cold-start safety branch pins users to "low" while this is null or episode_count < 5.
  confidence_signal: jsonb("confidence_signal"),
  // STORY-040 — sticky preference for the GitHub portfolio repo name. Defaults to
  // "learnpro-portfolio" everywhere else; nullable here because the row is bootstrapped
  // before the user has connected a portfolio. Same coach-voice principle as quiet hours:
  // the user picks the name, we never auto-rename.
  github_portfolio_repo: text("github_portfolio_repo"),
  // STORY-040 — per-user toggle for "auto-push every passing episode without confirming".
  // OFF by default (AC #5 — opt-in only after the first manual push). The settings UI flips
  // this; the API gates auto-push checks against it.
  github_auto_push_enabled: boolean("github_auto_push_enabled").notNull().default(false),
  // STORY-045 — Email digest opt-ins. Both off by default; the user flips them on per-channel
  // from /settings/notifications. `email_weekly_day_of_week` is 1=Monday … 7=Sunday (ISO 8601).
  // `email_unsubscribe_token` is null until the first opt-in lands; populated then with a
  // random 32-byte hex string that powers the one-click unsubscribe link + RFC 8058 header.
  email_daily_opt_in: boolean("email_daily_opt_in").notNull().default(false),
  email_weekly_opt_in: boolean("email_weekly_opt_in").notNull().default(false),
  email_weekly_day_of_week: integer("email_weekly_day_of_week").notNull().default(1),
  email_unsubscribe_token: text("email_unsubscribe_token"),
  // STORY-036 — Tutor mode toggle. `cloud` = Anthropic Claude (default), `local` = Ollama,
  // `auto-fallback` = try cloud first, fall back to local on cloud failure. The CHECK
  // constraint limiting the column to the three documented modes lives in the migration.
  tutor_mode: text("tutor_mode").notNull().default("cloud"),
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
    // STORY-032 — knowledge graph population. `description` is a 1-2 sentence learner-facing
    // summary; `default_difficulty` is a 1-5 band the planner uses to pick a starting problem;
    // `tags` is a free-form jsonb string array (e.g. ["control-flow", "loops"]); `track_slugs`
    // is the jsonb string array linking a concept to one or more track slugs. All four are
    // nullable to keep prior STORY-019/020 inserts (which only set name/language/slug) valid;
    // the seeder backfills them from YAML.
    description: text("description"),
    default_difficulty: integer("default_difficulty"),
    tags: jsonb("tags"),
    track_slugs: jsonb("track_slugs"),
    created_at: createdAt(),
  },
  (t) => ({
    slug_uniq: uniqueIndex("concepts_slug_lang_uniq").on(t.org_id, t.language, t.slug),
    parent_idx: index("concepts_parent_idx").on(t.parent_concept_id),
  }),
);

// STORY-032 — directed prerequisite edge. `from_concept_id` depends on `to_concept_id`
// ("from depends on to" — i.e., to is a prerequisite of from). The unique index is the
// idempotency bedrock for the seeder's delete + re-insert pattern. Cycle detection is a
// pure CI-time check (vitest test loads YAML, walks the graph) — there is no DB-level
// constraint forbidding cycles.
export const prerequisites = pgTable(
  "prerequisites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    org_id: orgId(),
    from_concept_id: uuid("from_concept_id")
      .notNull()
      .references(() => concepts.id, { onDelete: "cascade" }),
    to_concept_id: uuid("to_concept_id")
      .notNull()
      .references(() => concepts.id, { onDelete: "cascade" }),
    created_at: createdAt(),
  },
  (t) => ({
    edge_uniq: uniqueIndex("prerequisites_edge_uniq").on(
      t.org_id,
      t.from_concept_id,
      t.to_concept_id,
    ),
    from_idx: index("prerequisites_from_idx").on(t.from_concept_id),
    to_idx: index("prerequisites_to_idx").on(t.to_concept_id),
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
    // STORY-037 — `kind` discriminator: "implement" (default, legacy bank) | "debug" (broken-code,
    // find-and-fix). STORY-038 added "comprehension" (read-this-code) using the same column. CHECK
    // constraint in 0018 enforces the enum at the DB level so a stray free-text write never reaches
    // the assigner; 0020 widens the CHECK to include "comprehension".
    kind: text("kind").notNull().default("implement"),
    // STORY-037 — non-null only when kind="debug". One of the 8 archetypes from
    // packages/problems/src/schema.ts BugArchetypeSchema. CHECK constraint in 0018 enforces the
    // enum. The tutor's debug-grade prompt + the profile's bug_finding_score axis both consume
    // this column.
    bug_archetype: text("bug_archetype"),
    // STORY-038 — non-null only when kind="comprehension". One of the three sub-formats:
    // "predict_output" | "trace_execution" | "reason_property". CHECK constraint in 0020 enforces
    // the enum.
    comprehension_format: text("comprehension_format"),
    // STORY-038 — non-null only when kind="comprehension". "multiple_choice" | "free_text". The
    // grader path branches on this column — multiple-choice uses a deterministic index match;
    // free-text uses an LLM rubric grader (`comprehensionGradeAgent`).
    answer_format: text("answer_format"),
    statement: text("statement").notNull(),
    starter_code: text("starter_code"),
    hidden_tests: jsonb("hidden_tests").notNull(),
    created_at: createdAt(),
  },
  (t) => ({
    slug_uniq: uniqueIndex("problems_slug_uniq").on(t.org_id, t.track_id, t.slug),
    track_kind_idx: index("problems_track_kind_idx").on(t.track_id, t.kind),
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
    // STORY-042 — per-episode "I got help" honesty flag. Set when the user opts in via the
    // submission result panel's toggle (or accepts the paste-detect modal's "I got help" path).
    // Skill-update logic short-circuits the concept-mastery bump for got_help=true episodes, but
    // grading and XP still proceed normally. Anti-dark-pattern: never penalize, just don't reward.
    got_help: boolean("got_help").notNull().default(false),
    // STORY-034 — split critique/grader agent rubric. 1-5 integer dimensions + free-text reasoning
    // produced by `gradeAgent` AFTER the tests-as-floor pass/fail. Nullable: historical rows
    // pre-split stay valid, and a parse-failure on the grader's LLM output skips the persist
    // (pass-with-warning, never block the user).
    rubric_idiomatic: integer("rubric_idiomatic"),
    rubric_efficiency: integer("rubric_efficiency"),
    rubric_test_coverage: integer("rubric_test_coverage"),
    rubric_reasoning: text("rubric_reasoning"),
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
    // STORY-023 — idempotency hook for cron-triggered notifications. When set, the in-app channel
    // skips the insert if a row with the same (user_id, dedupe_key) already exists in the last 24h
    // — so a daily-reminder cron firing twice in the same UTC day delivers exactly once. Nullable
    // because user-triggered notifications (e.g. test push) don't need it.
    dedupe_key: text("dedupe_key"),
  },
  (t) => ({
    // Bell-icon list query: descending by sent_at, scoped to a user.
    user_sent_idx: index("notifications_user_sent_idx").on(t.user_id, t.sent_at),
  }),
);

// STORY-023 — per-browser-endpoint Web Push subscription. One user can have many (laptop browser
// + phone browser, etc.); `endpoint` is unique because the Push API spec says it identifies a
// single push subscription. 410 Gone responses delete the row in `web-push-channel.ts`.
export const web_push_subscriptions = pgTable(
  "web_push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    org_id: orgId(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    created_at: createdAt(),
  },
  (t) => ({
    endpoint_uniq: uniqueIndex("web_push_subscriptions_endpoint_uniq").on(t.endpoint),
    user_idx: index("web_push_subscriptions_user_idx").on(t.user_id),
  }),
);

// STORY-031 — FSRS spaced-repetition state, one row per (user, concept). The `state` jsonb mirrors
// the algorithm's per-card view: `{ stability, difficulty, due (ISO), lapses, last_reviewed (ISO|null) }`.
// `total_reviews` counts how many times the user has graded a problem touching this concept (the
// FSRS card's internal `reps` is preserved inside `state` jsonb if a future Story needs it). The
// (user_id, concept_id) unique pair lets us idempotently UPSERT after each episode close.
export const concept_reviews = pgTable(
  "concept_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    org_id: orgId(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    concept_id: uuid("concept_id")
      .notNull()
      .references(() => concepts.id, { onDelete: "cascade" }),
    state: jsonb("state").notNull(),
    total_reviews: integer("total_reviews").notNull().default(0),
    created_at: createdAt(),
  },
  (t) => ({
    user_concept_uniq: uniqueIndex("concept_reviews_user_concept_uniq").on(t.user_id, t.concept_id),
    user_idx: index("concept_reviews_user_idx").on(t.user_id),
  }),
);

// STORY-024 — quiet-hours-deferred notifications. When the dispatcher's `shouldDeliverNow()`
// hook returns false (user is inside their quiet window), the dispatcher writes the would-be
// payload here with a `deliver_after` timestamp set to the next moment delivery is allowed.
// `processDeferredNotifications()` drains the table when the window opens and dispatches the
// payload through the normal channel chain. Anti-dark-pattern: notifications never get *dropped*,
// only *deferred*.
export const deferred_notifications = pgTable(
  "deferred_notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    org_id: orgId(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // The `NotificationInput` minus the user_id (carried separately for the index). jsonb lets the
    // shape evolve without requiring a migration each time the channel contract changes.
    payload: jsonb("payload").notNull(),
    // The first wall-clock instant the dispatcher is allowed to deliver this. The flusher's
    // SELECT is `WHERE deliver_after <= now()`.
    deliver_after: timestamp("deliver_after", { withTimezone: true }).notNull(),
    created_at: createdAt(),
  },
  (t) => ({
    deliver_after_idx: index("deferred_notifications_deliver_after_idx").on(t.deliver_after),
    user_idx: index("deferred_notifications_user_idx").on(t.user_id),
  }),
);

// STORY-015 — session-plan agent. One row per generated 3-5 micro-objective plan. `items` is the
// jsonb array (slug + objective + estimated_duration_min + status + completed_at? + episode_id?).
// `expires_at` lets the API return null past the 24h window so the agent regenerates a fresh plan
// for the new session. `(user_id, created_at desc)` is the lookup index — "latest plan for user".
export const session_plans = pgTable(
  "session_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    org_id: orgId(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    created_at: createdAt(),
    time_budget_min: integer("time_budget_min").notNull(),
    items: jsonb("items").notNull(),
    expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => ({
    user_created_idx: index("session_plans_user_created_idx").on(t.user_id, t.created_at),
  }),
);

// Per-event XP attribution row. Stored separately from `users.xp` so we can answer "where did
// this XP come from?" — and so a (user_id, episode_id, reason) unique constraint can make XP
// awards idempotent: re-running grade for the same episode never double-awards.
//
// `episode_id` is nullable to leave room for future non-episode grants (badges, daily login
// bonuses, etc.) — the unique constraint still applies via the `reason` discriminator.
export const xp_awards = pgTable(
  "xp_awards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    org_id: orgId(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    episode_id: uuid("episode_id").references(() => episodes.id, { onDelete: "set null" }),
    amount: integer("amount").notNull(),
    reason: text("reason").notNull(),
    awarded_at: timestamp("awarded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    user_awarded_idx: index("xp_awards_user_awarded_idx").on(t.user_id, t.awarded_at),
    // Idempotency bedrock: ON CONFLICT DO NOTHING on insert + a conditional users.xp increment
    // means double-graded episodes never double-award. Composite includes `reason` so distinct
    // grant types for the same episode (e.g. base award + concept-mastery bonus) coexist.
    award_uniq: uniqueIndex("xp_awards_user_episode_reason_uniq").on(
      t.user_id,
      t.episode_id,
      t.reason,
    ),
  }),
);

// STORY-040 — one row per (user, episode) push to the user's GitHub portfolio repo. Re-pushing
// the same episode UPDATEs `commit_sha` + `pushed_at` rather than appending a duplicate row,
// per the unique constraint below. `directory_path` is the slug-shaped folder we wrote into
// (e.g. "python-fundamentals/two-sum/"); `auto` records whether this came from the per-user
// auto-push toggle or a manual click. The `(user_id, episode_id)` unique index is the
// idempotency bedrock — apps/api uses ON CONFLICT DO UPDATE to keep the row in sync.
export const portfolio_pushes = pgTable(
  "portfolio_pushes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    org_id: orgId(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    episode_id: uuid("episode_id")
      .notNull()
      .references(() => episodes.id, { onDelete: "cascade" }),
    repo_owner: text("repo_owner").notNull(),
    repo_name: text("repo_name").notNull().default("learnpro-portfolio"),
    directory_path: text("directory_path").notNull(),
    commit_sha: text("commit_sha").notNull(),
    pushed_at: timestamp("pushed_at", { withTimezone: true }).notNull().defaultNow(),
    auto: boolean("auto").notNull().default(false),
  },
  (t) => ({
    user_episode_uniq: uniqueIndex("portfolio_pushes_user_episode_uniq").on(
      t.user_id,
      t.episode_id,
    ),
    user_pushed_idx: index("portfolio_pushes_user_pushed_idx").on(t.user_id, t.pushed_at),
  }),
);

// STORY-033 — Async profile-insight rows. The async profile-update agent (Haiku, BullMQ) writes
// 1-3 cross-episode insights per session-end here. The tutor reads the latest 1-3 active
// (non-expired) rows at assign-problem time so its opener can reference them. `episodes_covered`
// is the jsonb array of episode UUIDs the synthesis was derived from (provenance). `concept_tags`
// is the kebab-case slugs the insight touches (cheap filter without re-running synthesis).
// `referenced_count` is bumped via `incrementReferenced()` each time the tutor's opener
// substring-matches the insight text — that's the AC #5 telemetry signal. `expires_at` defaults
// to created_at + 30 days; the dashboard + tutor only show rows where `expires_at > now()`.
export const profile_insights = pgTable(
  "profile_insights",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    org_id: orgId(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    insight_text: text("insight_text").notNull(),
    episodes_covered: jsonb("episodes_covered")
      .notNull()
      .default(sql`'[]'::jsonb`),
    concept_tags: jsonb("concept_tags")
      .notNull()
      .default(sql`'[]'::jsonb`),
    referenced_count: integer("referenced_count").notNull().default(0),
    created_at: createdAt(),
    expires_at: timestamp("expires_at", { withTimezone: true }),
  },
  (t) => ({
    user_created_idx: index("profile_insights_user_created_idx").on(t.user_id, t.created_at),
  }),
);

// STORY-041 — per-session personal cheatsheet. One row per generated cheatsheet derived from
// one or more episodes the user just closed. `episodes_covered` is a jsonb array of episode
// IDs. `entries` is the jsonb array of `{ concept, definition, code_example, gotcha }`
// objects (max ~6 entries — the agent prompt enforces the cap). `markdown_content` holds the
// rendered markdown the user can edit in place; `updated_at` tracks edits so the profile
// history can show "edited" markers when relevant.
export const cheatsheets = pgTable(
  "cheatsheets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    org_id: orgId(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    episodes_covered: jsonb("episodes_covered").notNull(),
    entries: jsonb("entries").notNull(),
    markdown_content: text("markdown_content").notNull(),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => ({
    user_created_idx: index("cheatsheets_user_created_idx").on(t.user_id, t.created_at),
  }),
);

// STORY-039 — LLM-generated problem variants. Cache table keyed off the source seed problem
// so the agent doesn't re-pay the generation cost on every request. `variant_def` stores the
// full jsonb-serialised `ProblemDef` (parsed against `ProblemDefSchema` on read), so a cache
// row is structurally interchangeable with a hand-authored YAML in the seed bank.
export const problem_variants = pgTable(
  "problem_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    org_id: orgId(),
    source_problem_id: uuid("source_problem_id")
      .notNull()
      .references(() => problems.id, { onDelete: "cascade" }),
    variant_def: jsonb("variant_def").notNull(),
    created_at: createdAt(),
  },
  (t) => ({
    source_idx: index("problem_variants_source_idx").on(t.source_problem_id, t.created_at),
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
export type Prerequisite = typeof prerequisites.$inferSelect;
export type NewPrerequisite = typeof prerequisites.$inferInsert;
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
export type WebPushSubscription = typeof web_push_subscriptions.$inferSelect;
export type NewWebPushSubscription = typeof web_push_subscriptions.$inferInsert;
export type XpAward = typeof xp_awards.$inferSelect;
export type NewXpAward = typeof xp_awards.$inferInsert;
export type SessionPlanRow = typeof session_plans.$inferSelect;
export type NewSessionPlanRow = typeof session_plans.$inferInsert;
export type DeferredNotification = typeof deferred_notifications.$inferSelect;
export type NewDeferredNotification = typeof deferred_notifications.$inferInsert;
export type ConceptReview = typeof concept_reviews.$inferSelect;
export type NewConceptReview = typeof concept_reviews.$inferInsert;
export type PortfolioPush = typeof portfolio_pushes.$inferSelect;
export type NewPortfolioPush = typeof portfolio_pushes.$inferInsert;
export type ProfileInsight = typeof profile_insights.$inferSelect;
export type NewProfileInsight = typeof profile_insights.$inferInsert;
export type Cheatsheet = typeof cheatsheets.$inferSelect;
export type NewCheatsheet = typeof cheatsheets.$inferInsert;
export type ProblemVariant = typeof problem_variants.$inferSelect;
export type NewProblemVariant = typeof problem_variants.$inferInsert;

export const ALL_TABLES = [
  organizations,
  users,
  accounts,
  sessions,
  verificationTokens,
  profiles,
  concepts,
  prerequisites,
  skill_scores,
  tracks,
  problems,
  episodes,
  submissions,
  agent_calls,
  interactions,
  notifications,
  web_push_subscriptions,
  xp_awards,
  session_plans,
  deferred_notifications,
  concept_reviews,
  portfolio_pushes,
  profile_insights,
  cheatsheets,
  problem_variants,
] as const;

// Auth.js tables (`accounts`, `sessions`, `verificationTokens`) are intentionally NOT in this
// list — their column names are fixed by the adapter contract and they don't carry `org_id`.
// Tenant attribution for an Auth.js-created user happens via the `users.org_id` row.
export const ORG_SCOPED_TABLES = [
  users,
  profiles,
  concepts,
  prerequisites,
  skill_scores,
  tracks,
  problems,
  episodes,
  submissions,
  agent_calls,
  interactions,
  notifications,
  web_push_subscriptions,
  xp_awards,
  session_plans,
  deferred_notifications,
  concept_reviews,
  portfolio_pushes,
  profile_insights,
  cheatsheets,
  problem_variants,
] as const;

export const PGVECTOR_PROLOGUE_SQL = sql`CREATE EXTENSION IF NOT EXISTS vector`;
