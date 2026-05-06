import { and, desc, eq, isNotNull, max } from "drizzle-orm";
import type { LearnProDb } from "./client.js";
import { agent_calls, episodes, interactions, sessions, submissions, users } from "./schema.js";

// STORY-056 — user-facing data controls. Backs the `/settings/data` page in apps/web with three
// helpers: a summary read for the "show what we have on you" view, a voice-only delete for the
// dual-gate (voice opt-in + voice-30-day-retention default), and a cascading account delete.
//
// All three are auth-gated by the calling route. These helpers don't do any auth themselves —
// they trust the user_id passed in.

export interface UserDataSummary {
  episodes_count: number;
  submissions_count: number;
  interactions_count: number;
  agent_calls_count: number;
  voice_transcripts_count: number;
  last_active_at: string | null;
}

export async function getUserDataSummary(
  db: LearnProDb,
  user_id: string,
): Promise<UserDataSummary> {
  const [episodesRows, submissionsRows, interactionsRows, agentCallsRows, voiceRows] =
    await Promise.all([
      db.select({ id: episodes.id }).from(episodes).where(eq(episodes.user_id, user_id)),
      db
        .select({ id: submissions.id })
        .from(submissions)
        .innerJoin(episodes, eq(submissions.episode_id, episodes.id))
        .where(eq(episodes.user_id, user_id)),
      db
        .select({ id: interactions.id })
        .from(interactions)
        .where(eq(interactions.user_id, user_id)),
      db.select({ id: agent_calls.id }).from(agent_calls).where(eq(agent_calls.user_id, user_id)),
      db
        .select({ id: interactions.id })
        .from(interactions)
        .where(and(eq(interactions.user_id, user_id), eq(interactions.type, "voice"))),
    ]);

  const lastInteraction = await db
    .select({ t: max(interactions.t) })
    .from(interactions)
    .where(eq(interactions.user_id, user_id));

  const lastEpisode = await db
    .select({ t: max(episodes.started_at) })
    .from(episodes)
    .where(eq(episodes.user_id, user_id));

  // Pick whichever timestamp is more recent. Both are nullable.
  const candidateA = lastInteraction[0]?.t ?? null;
  const candidateB = lastEpisode[0]?.t ?? null;
  let lastActiveIso: string | null = null;
  if (candidateA || candidateB) {
    const a = candidateA ? new Date(candidateA) : null;
    const b = candidateB ? new Date(candidateB) : null;
    const newest = a && b ? (a.getTime() > b.getTime() ? a : b) : (a ?? b);
    lastActiveIso = newest ? newest.toISOString() : null;
  }

  return {
    episodes_count: episodesRows.length,
    submissions_count: submissionsRows.length,
    interactions_count: interactionsRows.length,
    agent_calls_count: agentCallsRows.length,
    voice_transcripts_count: voiceRows.length,
    last_active_at: lastActiveIso,
  };
}

// Deletes every voice-typed `interactions` row for the user. Returns the deleted count.
export async function deleteUserVoiceTranscripts(db: LearnProDb, user_id: string): Promise<number> {
  const result = await db
    .delete(interactions)
    .where(and(eq(interactions.user_id, user_id), eq(interactions.type, "voice")))
    .returning({ id: interactions.id });
  return result.length;
}

// Cascading account delete. The `users` table has `onDelete: "cascade"` on `accounts` /
// `sessions` / `verificationTokens` / `profiles` / `episodes` / `interactions` / `notifications`
// / `web_push_subscriptions` / `xp_awards` / `session_plans` / `deferred_notifications` / etc.
// `agent_calls.user_id` is `set null` so historical cost data survives anonymized.
export interface DeleteAccountResult {
  deleted: boolean;
  deleted_user_id: string;
  // Sessions invalidated as part of the cascade. Echoed back so the route can clear the cookie.
  sessions_invalidated: number;
}

export async function deleteUserAccount(
  db: LearnProDb,
  user_id: string,
): Promise<DeleteAccountResult> {
  // Count sessions before delete so we can report it (cascade will wipe them anyway).
  const sessionRows = await db
    .select({ token: sessions.sessionToken })
    .from(sessions)
    .where(eq(sessions.userId, user_id));
  const sessionsCount = sessionRows.length;

  const result = await db.delete(users).where(eq(users.id, user_id)).returning({ id: users.id });
  return {
    deleted: result.length > 0,
    deleted_user_id: user_id,
    sessions_invalidated: sessionsCount,
  };
}

// Convenience read used by the data-summary view to list the most recent agent_calls. NOT
// exported via the API — reserved for the data-summary detail (currently aggregate only) so the
// helper is here for future use.
export async function listRecentAgentCalls(
  db: LearnProDb,
  user_id: string,
  limit = 10,
): Promise<{ called_at: Date; model: string; cost_usd: string }[]> {
  return db
    .select({
      called_at: agent_calls.called_at,
      model: agent_calls.model,
      cost_usd: agent_calls.cost_usd,
    })
    .from(agent_calls)
    .where(and(eq(agent_calls.user_id, user_id), isNotNull(agent_calls.user_id)))
    .orderBy(desc(agent_calls.called_at))
    .limit(limit);
}
