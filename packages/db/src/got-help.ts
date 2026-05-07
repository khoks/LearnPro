import { and, eq, sql } from "drizzle-orm";
import type { LearnProDb } from "./client.js";
import { episodes } from "./schema.js";

// STORY-042 — DB helpers for the per-episode `got_help` honesty flag.
//
// `markEpisodeGotHelp` flips the flag for one (user, episode) pair. Idempotent — repeating the
// same call is a cheap no-op. The (user_id) clause is a defense-in-depth check that also keeps the
// SQL update from accidentally touching a different tenant's row.
//
// `getEpisodeGotHelp` reads the flag back; used by API wrappers that want to short-circuit
// skill-mastery writes for got_help=true episodes (the wrapper around upsertSkillScore in apps/api).
//
// `countGotHelpEpisodes` powers the dashboard's "Honest sessions" stat — coach-voice copy that
// rewards self-honesty without shaming or surfacing per-problem detail. Anti-dark-pattern: there is
// no "got help ratio" anywhere in the UI.

export async function markEpisodeGotHelp(
  db: LearnProDb,
  input: { user_id: string; episode_id: string; got_help: boolean },
): Promise<{ updated: boolean }> {
  const r = await db
    .update(episodes)
    .set({ got_help: input.got_help })
    .where(and(eq(episodes.id, input.episode_id), eq(episodes.user_id, input.user_id)))
    .returning({ id: episodes.id });
  return { updated: r.length > 0 };
}

export async function getEpisodeGotHelp(
  db: LearnProDb,
  episode_id: string,
): Promise<boolean | null> {
  const rows = await db
    .select({ got_help: episodes.got_help })
    .from(episodes)
    .where(eq(episodes.id, episode_id))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  return r.got_help;
}

export async function countGotHelpEpisodes(db: LearnProDb, user_id: string): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(episodes)
    .where(sql`${episodes.user_id} = ${user_id} AND ${episodes.got_help} = true`);
  return rows[0]?.count ?? 0;
}
