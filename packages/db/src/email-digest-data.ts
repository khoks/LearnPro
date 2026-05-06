import { and, desc, eq, gte, lt } from "drizzle-orm";
import type { LearnProDb } from "./client.js";
import { episodes, problems, skill_scores, concepts } from "./schema.js";

// STORY-045 — Read-side helpers for the email digest builders. The digest builders themselves
// are pure functions; these helpers shape the data they consume from existing tables (episodes,
// problems, skill_scores, concepts) into a stable, narrow row type.

export interface DigestEpisodeRow {
  id: string;
  problem_slug: string;
  problem_name: string;
  finished_at: Date;
  final_outcome: "passed" | "passed_with_hints" | "failed" | "abandoned" | "revealed" | null;
  hints_used: number;
  time_to_solve_ms: number | null;
}

// Returns finished episodes that fell entirely between `start` (inclusive) and `end` (exclusive).
// Used by both daily (yesterday's window) and weekly (last 7 days' window) digests.
export async function listFinishedEpisodesInWindow(
  db: LearnProDb,
  user_id: string,
  start: Date,
  end: Date,
): Promise<DigestEpisodeRow[]> {
  const rows = await db
    .select({
      id: episodes.id,
      problem_slug: problems.slug,
      problem_name: problems.name,
      finished_at: episodes.finished_at,
      final_outcome: episodes.final_outcome,
      hints_used: episodes.hints_used,
      time_to_solve_ms: episodes.time_to_solve_ms,
    })
    .from(episodes)
    .innerJoin(problems, eq(episodes.problem_id, problems.id))
    .where(
      and(
        eq(episodes.user_id, user_id),
        gte(episodes.finished_at, start),
        lt(episodes.finished_at, end),
      ),
    )
    .orderBy(desc(episodes.finished_at));
  return rows
    .filter((r): r is typeof r & { finished_at: Date } => r.finished_at !== null)
    .map((r) => ({
      id: r.id,
      problem_slug: r.problem_slug,
      problem_name: r.problem_name,
      finished_at: r.finished_at,
      final_outcome: r.final_outcome,
      hints_used: r.hints_used,
      time_to_solve_ms: r.time_to_solve_ms,
    }));
}

export interface DigestSkillSnapshotRow {
  concept_slug: string;
  concept_name: string;
  language: string;
  score: number;
  confidence: number;
  last_practiced_at: Date | null;
}

// Snapshot of the user's top concepts by confidence (for the weekly digest's "skill snapshot"
// section). Capped at 8 to keep the email body terse.
export async function listSkillSnapshot(
  db: LearnProDb,
  user_id: string,
  limit = 8,
): Promise<DigestSkillSnapshotRow[]> {
  const rows = await db
    .select({
      concept_slug: concepts.slug,
      concept_name: concepts.name,
      language: concepts.language,
      score: skill_scores.score,
      confidence: skill_scores.confidence,
      last_practiced_at: skill_scores.last_practiced_at,
    })
    .from(skill_scores)
    .innerJoin(concepts, eq(skill_scores.concept_id, concepts.id))
    .where(eq(skill_scores.user_id, user_id))
    .orderBy(desc(skill_scores.confidence))
    .limit(limit);
  return rows.map((r) => ({
    concept_slug: r.concept_slug,
    concept_name: r.concept_name,
    language: r.language,
    score: r.score,
    confidence: r.confidence,
    last_practiced_at: r.last_practiced_at,
  }));
}
