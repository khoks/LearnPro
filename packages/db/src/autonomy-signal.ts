import { eq, sql } from "drizzle-orm";
import { ConfidenceSignalSchema, type ConfidenceSignal } from "@learnpro/scoring";
import type { LearnProDb } from "./client.js";
import { episodes, profiles, SELF_HOSTED_ORG_ID } from "./schema.js";

// STORY-054 — DB helpers for the per-user `confidence_signal` jsonb that drives the
// `EwmaBandedAutonomyPolicy`. The signal is a row on `profiles` (1:1 with users) that the
// updateProfile tool refreshes on every episode close.
//
// Cold-start: the column is null until the first close lands. Both helpers treat null as the
// cold-start case — `getConfidenceSignal` returns null, and `updateConfidenceSignalRow` performs
// a partial UPSERT (insert a fresh `profiles` row if none exists, else update only the
// confidence_signal column).

export interface UpdateConfidenceSignalRowOptions {
  db: LearnProDb;
  user_id: string;
  org_id?: string;
  signal: ConfidenceSignal;
}

export async function getConfidenceSignal(
  db: LearnProDb,
  user_id: string,
): Promise<ConfidenceSignal | null> {
  const rows = await db
    .select({ signal: profiles.confidence_signal })
    .from(profiles)
    .where(eq(profiles.user_id, user_id))
    .limit(1);
  const raw = rows[0]?.signal;
  if (raw === null || raw === undefined) return null;
  // jsonb round-trips through pg as `unknown`; re-validate so we don't ship malformed signals to
  // the policy. A schema mismatch (e.g. an older row format) collapses to null — the policy then
  // treats the user as cold-start and starts rebuilding the EWMAs from the next episode.
  const parsed = ConfidenceSignalSchema.safeParse(raw);
  if (!parsed.success) return null;
  return parsed.data;
}

// Partial UPSERT: writes the confidence_signal column on an existing profiles row, or inserts a
// fresh row keyed on user_id when none exists. Mirrors the pattern in `updateQuietHoursConfig`.
export async function updateConfidenceSignalRow(
  opts: UpdateConfidenceSignalRowOptions,
): Promise<void> {
  const { db, user_id, signal } = opts;
  const updated = await db
    .update(profiles)
    .set({ confidence_signal: signal, updated_at: new Date() })
    .where(eq(profiles.user_id, user_id))
    .returning({ user_id: profiles.user_id });
  if (updated.length > 0) return;

  await db
    .insert(profiles)
    .values({
      user_id,
      org_id: opts.org_id ?? SELF_HOSTED_ORG_ID,
      confidence_signal: signal,
    })
    .onConflictDoNothing();
  await db
    .update(profiles)
    .set({ confidence_signal: signal, updated_at: new Date() })
    .where(eq(profiles.user_id, user_id))
    .returning({ user_id: profiles.user_id });
}

// Counts closed episodes for a user (final_outcome IS NOT NULL). Used by the autonomy controller
// to compare against the cold_start_episodes threshold. Approximation only — we don't dedupe by
// problem_id because the controller only cares about the volume of signal it has on this user.
export async function countClosedEpisodes(db: LearnProDb, user_id: string): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(episodes)
    .where(sql`${episodes.user_id} = ${user_id} AND ${episodes.final_outcome} IS NOT NULL`);
  return rows[0]?.count ?? 0;
}
