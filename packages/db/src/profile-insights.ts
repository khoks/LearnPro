import { and, desc, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { LearnProDb } from "./client.js";
import { episodes, problems, profile_insights, SELF_HOSTED_ORG_ID } from "./schema.js";

// STORY-033 — DB helpers for the async profile-update agent's `profile_insights` table.
//
// Reads are Zod-validated at the boundary (jsonb columns can hold anything; we narrow them on
// the way out). Writes accept normalized inputs. The TTL (default 30 days) is computed by the
// helper, not by the DB — keeps the migration simple and lets us tune the window per call.

export const DEFAULT_INSIGHT_TTL_DAYS = 30;

export const InsightConceptTagsSchema = z.array(z.string().min(1));
export const InsightEpisodesCoveredSchema = z.array(z.string().uuid());

export interface ProfileInsight {
  id: string;
  user_id: string;
  org_id: string;
  insight_text: string;
  episodes_covered: string[];
  concept_tags: string[];
  referenced_count: number;
  created_at: Date;
  expires_at: Date | null;
}

export interface InsertInsightInput {
  user_id: string;
  org_id?: string;
  insight_text: string;
  episodes_covered?: ReadonlyArray<string>;
  concept_tags?: ReadonlyArray<string>;
  ttl_days?: number;
  now?: Date;
}

// Returns the latest non-expired insights for a user, newest first. `limit` defaults to 3 to
// match the "tutor sees the latest 1-3 active insights" wiring; callers can override for the
// dashboard / API surface (which might want up to 5).
export async function listLatestInsights(
  db: LearnProDb,
  user_id: string,
  limit = 3,
  now: Date = new Date(),
): Promise<ProfileInsight[]> {
  const rows = await db
    .select({
      id: profile_insights.id,
      user_id: profile_insights.user_id,
      org_id: profile_insights.org_id,
      insight_text: profile_insights.insight_text,
      episodes_covered: profile_insights.episodes_covered,
      concept_tags: profile_insights.concept_tags,
      referenced_count: profile_insights.referenced_count,
      created_at: profile_insights.created_at,
      expires_at: profile_insights.expires_at,
    })
    .from(profile_insights)
    .where(
      and(
        eq(profile_insights.user_id, user_id),
        or(isNull(profile_insights.expires_at), gt(profile_insights.expires_at, now)),
      ),
    )
    .orderBy(desc(profile_insights.created_at))
    .limit(limit);
  return rows.map(rowToInsight);
}

// Inserts a fresh insight row. `expires_at` defaults to created_at + 30 days; callers can
// override via `ttl_days`. Returns the persisted row (id + created_at + expires_at populated).
export async function insertInsight(
  db: LearnProDb,
  input: InsertInsightInput,
): Promise<ProfileInsight> {
  const now = input.now ?? new Date();
  const ttl = input.ttl_days ?? DEFAULT_INSIGHT_TTL_DAYS;
  const expires_at = new Date(now.getTime() + ttl * 24 * 60 * 60 * 1000);
  const concept_tags = InsightConceptTagsSchema.parse(input.concept_tags ?? []);
  const episodes_covered = InsightEpisodesCoveredSchema.parse(input.episodes_covered ?? []);
  const inserted = await db
    .insert(profile_insights)
    .values({
      org_id: input.org_id ?? SELF_HOSTED_ORG_ID,
      user_id: input.user_id,
      insight_text: input.insight_text,
      episodes_covered,
      concept_tags,
      referenced_count: 0,
      created_at: now,
      expires_at,
    })
    .returning({
      id: profile_insights.id,
      user_id: profile_insights.user_id,
      org_id: profile_insights.org_id,
      insight_text: profile_insights.insight_text,
      episodes_covered: profile_insights.episodes_covered,
      concept_tags: profile_insights.concept_tags,
      referenced_count: profile_insights.referenced_count,
      created_at: profile_insights.created_at,
      expires_at: profile_insights.expires_at,
    });
  const row = inserted[0];
  if (!row) throw new Error("profile_insights insert returned no row");
  return rowToInsight(row);
}

// AC #5 telemetry: bumped each time the tutor's assign-problem opener references an insight
// (substring match). Idempotent in the sense that bumping the same row twice is fine — the
// counter just advances. Returns the new value so the caller can log it.
export async function incrementReferenced(
  db: LearnProDb,
  insight_id: string,
): Promise<{ updated: boolean; new_count: number | null }> {
  const r = await db
    .update(profile_insights)
    .set({ referenced_count: sql`${profile_insights.referenced_count} + 1` })
    .where(eq(profile_insights.id, insight_id))
    .returning({ referenced_count: profile_insights.referenced_count });
  const row = r[0];
  if (!row) return { updated: false, new_count: null };
  return { updated: true, new_count: row.referenced_count };
}

// Counts the user's insights and the average referenced_count across non-expired rows. Powers
// the `GET /v1/profile-insights` telemetry block (AC #5). Returns 0/0 when the user has no
// active insights yet.
export async function getInsightTelemetry(
  db: LearnProDb,
  user_id: string,
  now: Date = new Date(),
): Promise<{ active_count: number; avg_referenced_count_per_insight: number }> {
  const rows = await db
    .select({
      active_count: sql<number>`count(*)::int`,
      avg_ref: sql<number | null>`avg(${profile_insights.referenced_count})::float`,
    })
    .from(profile_insights)
    .where(
      and(
        eq(profile_insights.user_id, user_id),
        or(isNull(profile_insights.expires_at), gt(profile_insights.expires_at, now)),
      ),
    );
  const r = rows[0];
  if (!r) return { active_count: 0, avg_referenced_count_per_insight: 0 };
  const avg = r.avg_ref;
  return {
    active_count: r.active_count,
    avg_referenced_count_per_insight: avg === null || Number.isNaN(avg) ? 0 : Number(avg),
  };
}

// STORY-033 — minimal projection of an episode + its problem context for the synthesis prompt.
// Pulled in `listEpisodesForSynthesis()` below; the agent's synthesis function uses these to
// build the user-message body of the Haiku call.
export interface InsightSourceEpisode {
  episode_id: string;
  problem_slug: string;
  problem_name: string;
  problem_language: "python" | "typescript";
  concept_tags: string[];
  final_outcome: string | null;
  hints_used: number;
  attempts: number;
  time_to_solve_ms: number | null;
  finished_at: Date | null;
}

const ConceptTagsRowSchema = z.array(z.string()).default([]);

// Loads the last `windowDays` of finished episodes for synthesis — newest first. Each row is
// joined with the problem definition so the synthesis prompt can reference problem name +
// language + concept tags. `windowDays` defaults to 30 to match AC #2.
export async function listEpisodesForSynthesis(
  db: LearnProDb,
  user_id: string,
  windowDays = 30,
  now: Date = new Date(),
): Promise<InsightSourceEpisode[]> {
  const since = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      episode_id: episodes.id,
      problem_slug: problems.slug,
      problem_name: problems.name,
      problem_language: problems.language,
      hidden_tests: problems.hidden_tests,
      final_outcome: episodes.final_outcome,
      hints_used: episodes.hints_used,
      attempts: episodes.attempts,
      time_to_solve_ms: episodes.time_to_solve_ms,
      finished_at: episodes.finished_at,
    })
    .from(episodes)
    .innerJoin(problems, eq(episodes.problem_id, problems.id))
    .where(and(eq(episodes.user_id, user_id), gt(episodes.started_at, since)))
    .orderBy(desc(episodes.started_at))
    .limit(50);
  return rows.map((r) => ({
    episode_id: r.episode_id,
    problem_slug: r.problem_slug,
    problem_name: r.problem_name,
    problem_language: r.problem_language,
    concept_tags: extractConceptTagsFromHiddenTests(r.hidden_tests),
    final_outcome: r.final_outcome,
    hints_used: r.hints_used,
    attempts: r.attempts,
    time_to_solve_ms: r.time_to_solve_ms,
    finished_at: r.finished_at,
  }));
}

function extractConceptTagsFromHiddenTests(hidden: unknown): string[] {
  if (!hidden || typeof hidden !== "object") return [];
  const obj = hidden as Record<string, unknown>;
  const tags = obj["concept_tags"];
  const parsed = ConceptTagsRowSchema.safeParse(tags);
  if (!parsed.success) return [];
  return parsed.data;
}

// Sweeps insights past their `expires_at` — used by the retention pass + tests that need to
// reset state. Returns the number of rows deleted.
export async function deleteExpiredInsights(
  db: LearnProDb,
  now: Date = new Date(),
): Promise<{ deleted: number }> {
  const r = await db
    .delete(profile_insights)
    .where(
      and(sql`${profile_insights.expires_at} IS NOT NULL`, lt(profile_insights.expires_at, now)),
    )
    .returning({ id: profile_insights.id });
  return { deleted: r.length };
}

function rowToInsight(row: {
  id: string;
  user_id: string;
  org_id: string;
  insight_text: string;
  episodes_covered: unknown;
  concept_tags: unknown;
  referenced_count: number;
  created_at: Date;
  expires_at: Date | null;
}): ProfileInsight {
  const concept_tags = InsightConceptTagsSchema.safeParse(row.concept_tags);
  const episodes_covered = InsightEpisodesCoveredSchema.safeParse(row.episodes_covered);
  return {
    id: row.id,
    user_id: row.user_id,
    org_id: row.org_id,
    insight_text: row.insight_text,
    episodes_covered: episodes_covered.success ? episodes_covered.data : [],
    concept_tags: concept_tags.success ? concept_tags.data : [],
    referenced_count: row.referenced_count,
    created_at: row.created_at,
    expires_at: row.expires_at,
  };
}
