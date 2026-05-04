import { and, desc, eq, gte, sql } from "drizzle-orm";
import {
  computeStreak,
  shouldReplenishGrace,
  utcDayKey,
  type ComputeStreakResult,
} from "@learnpro/scoring";
import type { LearnProDb } from "./client.js";
import {
  episodes,
  problems,
  SELF_HOSTED_ORG_ID,
  skill_scores,
  tracks,
  users,
  xp_awards,
} from "./schema.js";

// DB-side glue for STORY-022 gamification: XP awarding (idempotent), grace-day refill, per-track
// progress aggregation. The pure policies live in @learnpro/scoring (xp-policy / streak-policy);
// this file is the only place those policies meet the DB.

// Reads users.xp. Returns 0 when the user row is missing (defensive — the dashboard prefers a
// silent 0 over a crash for a soft-deleted account).
export async function getUserXp(db: LearnProDb, user_id: string): Promise<number> {
  const rows = await db.select({ xp: users.xp }).from(users).where(eq(users.id, user_id)).limit(1);
  return rows[0]?.xp ?? 0;
}

export interface AwardXpInput {
  user_id: string;
  org_id?: string;
  episode_id: string | null;
  amount: number;
  reason: string;
}

export interface AwardXpResult {
  inserted: boolean;
  amount: number;
}

// Idempotent XP grant. Inserts the xp_awards row with ON CONFLICT DO NOTHING — the unique
// constraint on (user_id, episode_id, reason) means re-running grade for the same episode never
// double-awards. Only when the insert actually lands do we increment users.xp; otherwise the
// helper returns `inserted: false` and the user's lifetime XP is unchanged.
//
// `amount` may legitimately be 0 (e.g. failed-episode reason rows for dashboard breadcrumbs).
// Inserting 0 still bumps xp by 0, which is a no-op but lets us surface the "you tried" credit.
export async function awardXp(db: LearnProDb, input: AwardXpInput): Promise<AwardXpResult> {
  const inserted = await db
    .insert(xp_awards)
    .values({
      org_id: input.org_id ?? SELF_HOSTED_ORG_ID,
      user_id: input.user_id,
      episode_id: input.episode_id,
      amount: input.amount,
      reason: input.reason,
    })
    .onConflictDoNothing({
      target: [xp_awards.user_id, xp_awards.episode_id, xp_awards.reason],
    })
    .returning({ id: xp_awards.id });

  if (inserted.length === 0) {
    return { inserted: false, amount: 0 };
  }

  if (input.amount > 0) {
    await db
      .update(users)
      .set({ xp: sql`${users.xp} + ${input.amount}` })
      .where(eq(users.id, input.user_id));
  }
  return { inserted: true, amount: input.amount };
}

// Lazy refill: bumps streak_grace_days_remaining back up to `monthly_cap` if the last refill
// was in a strictly earlier UTC month. No-op otherwise. Called by getStreakInputs() so the
// dashboard read never sees a stale counter.
export async function replenishGraceDays(
  db: LearnProDb,
  user_id: string,
  monthly_cap: number,
  now: Date = new Date(),
): Promise<{ replenished: boolean }> {
  const rows = await db
    .select({ last: users.streak_grace_last_replenished_at })
    .from(users)
    .where(eq(users.id, user_id))
    .limit(1);
  const last = rows[0]?.last ?? null;
  if (!shouldReplenishGrace(last, now)) return { replenished: false };

  await db
    .update(users)
    .set({
      streak_grace_days_remaining: monthly_cap,
      streak_grace_last_replenished_at: now,
    })
    .where(eq(users.id, user_id));
  return { replenished: true };
}

// Atomically decrements the grace counter by `count`. Floors at 0 so a buggy caller can't drive
// the counter negative. Returns the new value.
export async function consumeGraceDay(
  db: LearnProDb,
  user_id: string,
  count: number,
): Promise<{ remaining: number }> {
  if (count <= 0) {
    const rows = await db
      .select({ remaining: users.streak_grace_days_remaining })
      .from(users)
      .where(eq(users.id, user_id))
      .limit(1);
    return { remaining: rows[0]?.remaining ?? 0 };
  }
  const updated = await db
    .update(users)
    .set({
      streak_grace_days_remaining: sql`GREATEST(0, ${users.streak_grace_days_remaining} - ${count})`,
    })
    .where(eq(users.id, user_id))
    .returning({ remaining: users.streak_grace_days_remaining });
  return { remaining: updated[0]?.remaining ?? 0 };
}

export interface StreakInputs {
  episodeDays: Date[];
  graceDaysRemaining: number;
}

// Reads the inputs `computeStreak()` needs — the user's recent finished episode UTC day list +
// the grace counter (lazy-refilled). The lookback is bounded to 90 days because that's the data
// retention window in STORY-056 and a longer streak than that is implausible for MVP.
export async function getStreakInputs(
  db: LearnProDb,
  user_id: string,
  today: Date = new Date(),
  monthly_grace_cap: number = 2,
  lookback_days: number = 90,
): Promise<StreakInputs> {
  await replenishGraceDays(db, user_id, monthly_grace_cap, today);

  const cutoff = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - lookback_days),
  );
  const dayRows = await db
    .selectDistinct({
      day: sql<string>`date_trunc('day', ${episodes.finished_at} at time zone 'utc')`,
    })
    .from(episodes)
    .where(
      and(
        eq(episodes.user_id, user_id),
        sql`${episodes.finished_at} is not null`,
        gte(episodes.finished_at, cutoff),
      ),
    )
    .orderBy(desc(sql`date_trunc('day', ${episodes.finished_at} at time zone 'utc')`));

  const userRow = await db
    .select({ remaining: users.streak_grace_days_remaining })
    .from(users)
    .where(eq(users.id, user_id))
    .limit(1);

  return {
    // The DISTINCT cast returns ISO timestamp strings — wrap each as a UTC Date the policy can
    // bucket via utcDayKey().
    episodeDays: dayRows.map((r) => new Date(r.day)),
    graceDaysRemaining: userRow[0]?.remaining ?? monthly_grace_cap,
  };
}

// Convenience read that bundles the two operations the dashboard does: refill + compute. Exposed
// here so the dashboard route doesn't need to import streak-policy directly. Useful for tests.
export async function getStreakSnapshot(
  db: LearnProDb,
  user_id: string,
  today: Date = new Date(),
  monthly_grace_cap: number = 2,
): Promise<ComputeStreakResult & { todayKey: string }> {
  const inputs = await getStreakInputs(db, user_id, today, monthly_grace_cap);
  const result = computeStreak({
    episodeDays: inputs.episodeDays,
    today,
    graceDaysRemaining: inputs.graceDaysRemaining,
  });
  return { ...result, todayKey: utcDayKey(today) };
}

export interface TrackProgress {
  track_slug: string;
  track_name: string;
  language: "python" | "typescript";
  mastered: number;
  total: number;
  ratio: number;
}

// Per-track concept-mastery snapshot for the dashboard progress bars. "Mastered" defaults to
// `confidence >= 50` — the same scale skill_scores stores (0..100 ints). The threshold is a
// parameter so a future Story can tune it per-track / per-curriculum.
export async function getTrackProgress(
  db: LearnProDb,
  user_id: string,
  track_slug: string,
  mastery_confidence_threshold: number = 50,
): Promise<TrackProgress | null> {
  const trackRow = await db
    .select({ slug: tracks.slug, name: tracks.name, language: tracks.language })
    .from(tracks)
    .where(eq(tracks.slug, track_slug))
    .limit(1);
  const track = trackRow[0];
  if (!track) return null;

  // Total = distinct concept_tags across all problems on this track. Each problem stores its
  // concept tags inside hidden_tests jsonb (see ProblemDef.concept_tags); we unnest them so the
  // dashboard's "mastered/total" reflects the curriculum's reach, not the user's history.
  const totalRows = await db
    .select({
      tag: sql<string>`jsonb_array_elements_text(coalesce(${problems.hidden_tests}->'concept_tags', '[]'::jsonb))`,
    })
    .from(problems)
    .innerJoin(tracks, eq(problems.track_id, tracks.id))
    .where(eq(tracks.slug, track_slug));
  const allTags = new Set(totalRows.map((r) => r.tag));
  const total = allTags.size;

  if (total === 0) {
    return {
      track_slug: track.slug,
      track_name: track.name,
      language: track.language,
      mastered: 0,
      total: 0,
      ratio: 0,
    };
  }

  // Mastered = concepts on this track's language whose skill_score for the user is at or above
  // the threshold. We scope by language because concept slugs can collide across tracks.
  const masteredRows = await db
    .select({ confidence: skill_scores.confidence, slug: sql<string>`c.slug` })
    .from(skill_scores)
    .innerJoin(sql`concepts c`, sql`c.id = ${skill_scores.concept_id}`)
    .where(
      and(
        eq(skill_scores.user_id, user_id),
        gte(skill_scores.confidence, mastery_confidence_threshold),
        eq(sql`c.language`, track.language),
      ),
    );
  const masteredOnTrack = masteredRows.filter((r) => allTags.has(r.slug)).length;

  return {
    track_slug: track.slug,
    track_name: track.name,
    language: track.language,
    mastered: masteredOnTrack,
    total,
    ratio: total === 0 ? 0 : masteredOnTrack / total,
  };
}

// Returns the slugs of all tracks the user has ever started an episode on, newest-first.
// Drives the dashboard's "show me a progress bar per track I've touched".
export async function getActiveTrackSlugs(db: LearnProDb, user_id: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({
      slug: tracks.slug,
      most_recent: sql<Date>`max(${episodes.started_at})`,
    })
    .from(episodes)
    .innerJoin(problems, eq(episodes.problem_id, problems.id))
    .innerJoin(tracks, eq(problems.track_id, tracks.id))
    .where(eq(episodes.user_id, user_id))
    .groupBy(tracks.slug)
    .orderBy(desc(sql`max(${episodes.started_at})`));
  return rows.map((r) => r.slug);
}
