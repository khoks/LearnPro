import { asc, eq, inArray } from "drizzle-orm";
import type { LearnProDb } from "./client.js";
import {
  agent_calls,
  episodes,
  notifications,
  profiles,
  submissions,
  users,
  type AgentCall,
  type Episode,
  type Notification,
  type Profile,
  type Submission,
  type User,
} from "./schema.js";

// STORY-026 — GDPR-style user data export.
//
// Streams a single JSON envelope describing everything the system knows about `user_id`:
// `profile`, `episodes`, `submissions`, `agent_calls`, `notifications`, `settings`. The
// caller supplies a `write(chunk)` callback so the helper stays Fastify-agnostic — the API
// route plumbs `(c) => stream.push(c)` to a Node Readable; tests pass an array collector.
//
// Round-trip-importable shape: every FK-relevant column is included, timestamps are emitted
// as ISO-8601 strings, jsonb columns are emitted as JSON. A companion `importDump()` helper
// (deserialize + write back into a fresh instance) is intentionally deferred to a separate
// Story. The shape here is the contract that future helper has to honor.
//
// Note on `settings`: there is no separate `settings` table yet. `profiles` already holds
// `target_role`, `time_budget_min`, `language_comfort` etc., so the same row is surfaced both
// as `profile` (the raw row) and `settings` (the user-tunable subset). Once a real settings
// table exists this helper changes; consumers reading `settings` won't.
export interface ExportUserDataOptions {
  // The Drizzle DB handle. Bypassed when `fetcher` is supplied (tests inject fakes).
  db?: LearnProDb;
  user_id: string;
  write: (chunk: string) => void;
  // Page size for the streamed array sections. Keeps memory bounded for users with 10k+ rows.
  // Tests can lower this to exercise the multi-page path; production stays at the default.
  page_size?: number;
  // Injectable for tests. When omitted, a Drizzle-backed fetcher is built from `db`.
  fetcher?: ExportFetcher;
}

const DEFAULT_PAGE_SIZE = 500;

// The narrow set of read shapes exportUserData() needs from the DB. Drizzle satisfies it via
// `drizzleExportFetcher(db)` below. Tests can implement it directly with arrays.
export interface ExportFetcher {
  user(user_id: string): Promise<User | null>;
  profile(user_id: string): Promise<Profile | null>;
  episodesPage(user_id: string, limit: number, offset: number): Promise<Episode[]>;
  submissionsByEpisodes(episodeIds: string[]): Promise<Submission[]>;
  agentCallsPage(user_id: string, limit: number, offset: number): Promise<AgentCall[]>;
  notificationsPage(user_id: string, limit: number, offset: number): Promise<Notification[]>;
}

export async function exportUserData(opts: ExportUserDataOptions): Promise<void> {
  const { user_id, write } = opts;
  const pageSize = opts.page_size ?? DEFAULT_PAGE_SIZE;
  const fetcher = opts.fetcher ?? drizzleExportFetcher(requireDb(opts.db));

  const userRow = await fetcher.user(user_id);
  const profileRow = await fetcher.profile(user_id);

  write("{");

  // profile — the joined user + profile snapshot. `null` when the user doesn't exist.
  write('"profile":');
  write(userRow === null ? "null" : JSON.stringify(serializeProfile(userRow, profileRow)));

  // settings — the user-tunable subset of `profiles`. Mirrors the round-trip-importable
  // contract: re-importing a settings block is enough to restore tuning preferences without
  // touching identity fields.
  write(',"settings":');
  write(profileRow === null ? "null" : JSON.stringify(serializeSettings(profileRow)));

  // episodes — fetched in pages so a 10k-episode user doesn't pull everything into memory.
  // Episode IDs collected here scope the submissions query below.
  const episodeIds: string[] = [];
  await streamArray("episodes", write, async function* () {
    let offset = 0;
    while (true) {
      const rows = await fetcher.episodesPage(user_id, pageSize, offset);
      if (rows.length === 0) return;
      for (const row of rows) {
        episodeIds.push(row.id);
        yield serializeEpisode(row);
      }
      if (rows.length < pageSize) return;
      offset += pageSize;
    }
  });

  // submissions — scoped via episode_id IN (the user's episode IDs). Chunked to avoid an
  // oversized IN list when the user has many episodes.
  await streamArray("submissions", write, async function* () {
    if (episodeIds.length === 0) return;
    for (let i = 0; i < episodeIds.length; i += pageSize) {
      const chunk = episodeIds.slice(i, i + pageSize);
      const rows = await fetcher.submissionsByEpisodes(chunk);
      for (const row of rows) yield serializeSubmission(row);
    }
  });

  // agent_calls — direct user_id scope.
  await streamArray("agent_calls", write, async function* () {
    let offset = 0;
    while (true) {
      const rows = await fetcher.agentCallsPage(user_id, pageSize, offset);
      if (rows.length === 0) return;
      for (const row of rows) yield serializeAgentCall(row);
      if (rows.length < pageSize) return;
      offset += pageSize;
    }
  });

  // notifications — direct user_id scope.
  await streamArray("notifications", write, async function* () {
    let offset = 0;
    while (true) {
      const rows = await fetcher.notificationsPage(user_id, pageSize, offset);
      if (rows.length === 0) return;
      for (const row of rows) yield serializeNotification(row);
      if (rows.length < pageSize) return;
      offset += pageSize;
    }
  });

  write("}");
}

// Production fetcher — the only place Drizzle queries appear.
export function drizzleExportFetcher(db: LearnProDb): ExportFetcher {
  return {
    async user(user_id) {
      const rows = await db.select().from(users).where(eq(users.id, user_id)).limit(1);
      return rows[0] ?? null;
    },
    async profile(user_id) {
      const rows = await db.select().from(profiles).where(eq(profiles.user_id, user_id)).limit(1);
      return rows[0] ?? null;
    },
    async episodesPage(user_id, limit, offset) {
      return db
        .select()
        .from(episodes)
        .where(eq(episodes.user_id, user_id))
        .orderBy(asc(episodes.started_at), asc(episodes.id))
        .limit(limit)
        .offset(offset);
    },
    async submissionsByEpisodes(episodeIds) {
      if (episodeIds.length === 0) return [];
      return db
        .select()
        .from(submissions)
        .where(inArray(submissions.episode_id, episodeIds))
        .orderBy(asc(submissions.submitted_at), asc(submissions.id));
    },
    async agentCallsPage(user_id, limit, offset) {
      return db
        .select()
        .from(agent_calls)
        .where(eq(agent_calls.user_id, user_id))
        .orderBy(asc(agent_calls.called_at), asc(agent_calls.id))
        .limit(limit)
        .offset(offset);
    },
    async notificationsPage(user_id, limit, offset) {
      return db
        .select()
        .from(notifications)
        .where(eq(notifications.user_id, user_id))
        .orderBy(asc(notifications.sent_at), asc(notifications.id))
        .limit(limit)
        .offset(offset);
    },
  };
}

function requireDb(db: LearnProDb | undefined): LearnProDb {
  if (!db) {
    throw new Error("exportUserData: either `db` or `fetcher` must be supplied");
  }
  return db;
}

// Emit `"<key>":[<comma-joined items>]` with at most one item buffered at a time.
async function streamArray(
  key: string,
  write: (chunk: string) => void,
  iter: () => AsyncGenerator<unknown>,
): Promise<void> {
  write(`,"${key}":[`);
  let first = true;
  for await (const item of iter()) {
    if (!first) write(",");
    write(JSON.stringify(item));
    first = false;
  }
  write("]");
}

// Serializers — pull rows into plain objects with ISO timestamps. Centralizing here keeps the
// JSON shape stable across schema additions: a new column has to be wired through one of these
// functions to leak into the export, which is the right default for privacy-sensitive output.

function serializeProfile(user: User, profile: Profile | null): Record<string, unknown> {
  return {
    user_id: user.id,
    org_id: user.org_id,
    email: user.email,
    name: user.name,
    image: user.image,
    emailVerified: user.emailVerified ? user.emailVerified.toISOString() : null,
    created_at: user.created_at.toISOString(),
    xp: user.xp,
    streak_grace_days_remaining: user.streak_grace_days_remaining,
    streak_grace_last_replenished_at: user.streak_grace_last_replenished_at
      ? user.streak_grace_last_replenished_at.toISOString()
      : null,
    profile: profile
      ? {
          target_role: profile.target_role,
          time_budget_min: profile.time_budget_min,
          primary_goal: profile.primary_goal,
          self_assessed_level: profile.self_assessed_level,
          language_comfort: profile.language_comfort,
          updated_at: profile.updated_at.toISOString(),
        }
      : null,
  };
}

function serializeSettings(profile: Profile): Record<string, unknown> {
  return {
    target_role: profile.target_role,
    time_budget_min: profile.time_budget_min,
    primary_goal: profile.primary_goal,
    self_assessed_level: profile.self_assessed_level,
    language_comfort: profile.language_comfort,
    updated_at: profile.updated_at.toISOString(),
  };
}

function serializeEpisode(row: Episode): Record<string, unknown> {
  return {
    id: row.id,
    org_id: row.org_id,
    user_id: row.user_id,
    problem_id: row.problem_id,
    started_at: row.started_at.toISOString(),
    finished_at: row.finished_at ? row.finished_at.toISOString() : null,
    hints_used: row.hints_used,
    attempts: row.attempts,
    final_outcome: row.final_outcome,
    time_to_solve_ms: row.time_to_solve_ms,
    interactions_summary: row.interactions_summary,
    // `embedding` deliberately omitted — it's a 1536-dim vector that bloats the export and is
    // re-derivable from the episode content. A future Story can flip this to opt-in.
  };
}

function serializeSubmission(row: Submission): Record<string, unknown> {
  return {
    id: row.id,
    org_id: row.org_id,
    episode_id: row.episode_id,
    submitted_at: row.submitted_at.toISOString(),
    code: row.code,
    passed: row.passed,
    runtime_ms: row.runtime_ms,
  };
}

function serializeAgentCall(row: AgentCall): Record<string, unknown> {
  return {
    id: row.id,
    org_id: row.org_id,
    user_id: row.user_id,
    session_id: row.session_id,
    episode_id: row.episode_id,
    provider: row.provider,
    model: row.model,
    role: row.role,
    task: row.task,
    prompt_version: row.prompt_version,
    input_tokens: row.input_tokens,
    output_tokens: row.output_tokens,
    cached_tokens: row.cached_tokens,
    cost_usd: row.cost_usd,
    pricing_version: row.pricing_version,
    tool_used: row.tool_used,
    latency_ms: row.latency_ms,
    ok: row.ok,
    called_at: row.called_at.toISOString(),
  };
}

function serializeNotification(row: Notification): Record<string, unknown> {
  return {
    id: row.id,
    org_id: row.org_id,
    user_id: row.user_id,
    channel: row.channel,
    title: row.title,
    body: row.body,
    sent_at: row.sent_at.toISOString(),
    read_at: row.read_at ? row.read_at.toISOString() : null,
  };
}
