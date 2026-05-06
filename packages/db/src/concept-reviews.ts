import { and, eq, sql } from "drizzle-orm";
import {
  FsrsCardStateSchema,
  isDue,
  type FsrsCardState,
} from "@learnpro/scoring";
import type { LearnProDb } from "./client.js";
import { concept_reviews, SELF_HOSTED_ORG_ID } from "./schema.js";

// STORY-031 — DB-side glue for the FSRS spaced-repetition scheduler. The pure policy lives in
// @learnpro/scoring/policies/spaced-repetition.ts; this file is the only place that policy meets
// a connection. Mirrors the shape of `xp-streak.ts` (the @learnpro/db ↔ @learnpro/scoring
// bridge for STORY-022).

export interface RecordReviewInput {
  user_id: string;
  org_id?: string;
  concept_id: string;
  next_state: FsrsCardState;
}

// Reads the FSRS card state for a single (user, concept). Returns null when no row exists yet
// (the cold-start case — the caller seeds via `initialCardState()` from @learnpro/scoring).
// Defensive Zod parse: a row with a malformed jsonb (older format / hand-edited / truncated)
// collapses to null and the caller treats it as cold-start. The next graded review writes a
// fresh, validated state back, so corruption is self-healing across one review.
export async function getCardState(
  db: LearnProDb,
  user_id: string,
  concept_id: string,
): Promise<FsrsCardState | null> {
  const rows = await db
    .select({ state: concept_reviews.state })
    .from(concept_reviews)
    .where(
      and(eq(concept_reviews.user_id, user_id), eq(concept_reviews.concept_id, concept_id)),
    )
    .limit(1);
  const raw = rows[0]?.state;
  if (raw === null || raw === undefined) return null;
  const parsed = FsrsCardStateSchema.safeParse(raw);
  if (!parsed.success) return null;
  return parsed.data;
}

// Idempotent UPSERT of the card state. ON CONFLICT (user_id, concept_id) updates the state +
// bumps total_reviews by 1. The DB-side increment keeps `total_reviews` correct under concurrent
// writes; we never compute it client-side.
export async function upsertCardState(
  db: LearnProDb,
  user_id: string,
  concept_id: string,
  next_state: FsrsCardState,
  org_id: string = SELF_HOSTED_ORG_ID,
): Promise<void> {
  await db
    .insert(concept_reviews)
    .values({
      org_id,
      user_id,
      concept_id,
      state: next_state,
      total_reviews: 1,
    })
    .onConflictDoUpdate({
      target: [concept_reviews.user_id, concept_reviews.concept_id],
      set: {
        state: next_state,
        total_reviews: sql`${concept_reviews.total_reviews} + 1`,
      },
    });
}

// Convenience wrapper: a single transactional UPSERT of the next state with the total_reviews
// increment. The `prev` argument is currently informational only — the next state already
// captures everything we need to persist — but lets a future Story (e.g. a per-review log table)
// capture the before/after pair without re-shaping the call site.
export async function recordReview(
  db: LearnProDb,
  user_id: string,
  concept_id: string,
  _prev: FsrsCardState | null,
  next: FsrsCardState,
  org_id: string = SELF_HOSTED_ORG_ID,
): Promise<void> {
  await upsertCardState(db, user_id, concept_id, next, org_id);
}

export interface DueConceptRow {
  concept_id: string;
  state: FsrsCardState;
}

// Returns the user's due concept ids — those whose `state.due` is at or before `now`. Bounded at
// 50 rows per spec (the dashboard's "N concepts due" card and the assigner's tie-breaker both
// look at no more than this; a per-user batch larger than 50 would already be a curriculum
// rebalance not a review session).
//
// Implementation note: the FSRS due timestamp lives inside the jsonb `state` column so a btree
// index on the column can't drive this query. We filter in app code after a per-user scan that
// is itself indexed (`concept_reviews_user_idx`). With <= a few hundred concept rows per active
// user the filter is cheap; if this ever grows we can promote `due` to its own column.
export async function getDueConcepts(
  db: LearnProDb,
  user_id: string,
  now: Date = new Date(),
): Promise<DueConceptRow[]> {
  const rows = await db
    .select({ concept_id: concept_reviews.concept_id, state: concept_reviews.state })
    .from(concept_reviews)
    .where(eq(concept_reviews.user_id, user_id));

  const due: DueConceptRow[] = [];
  for (const row of rows) {
    const parsed = FsrsCardStateSchema.safeParse(row.state);
    if (!parsed.success) continue;
    if (!isDue({ state: parsed.data, now })) continue;
    due.push({ concept_id: row.concept_id, state: parsed.data });
    if (due.length >= 50) break;
  }
  return due;
}

// Helper used by the dashboard endpoint: returns the same shape as `getDueConcepts` but enriched
// with a derived `days_overdue` integer (>= 0) so the UI can sort / colour-code without parsing
// timestamps client-side. The "overdue" floor is 0 — a card whose due is exactly `now` reports 0.
export interface DueConceptWithOverdue extends DueConceptRow {
  days_overdue: number;
}

export function withOverdueDays(
  rows: DueConceptRow[],
  now: Date = new Date(),
): DueConceptWithOverdue[] {
  return rows.map((row) => {
    const dueMs = new Date(row.state.due).getTime();
    const deltaDays = Math.max(0, Math.floor((now.getTime() - dueMs) / 86400_000));
    return { ...row, days_overdue: deltaDays };
  });
}
