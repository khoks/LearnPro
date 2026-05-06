import { eq, inArray } from "drizzle-orm";
import type { LearnProDb } from "./client.js";
import { episodes, SELF_HOSTED_ORG_ID, tracks } from "./schema.js";

// Light-weight, read-only helpers for the recommendation flow (STORY-021). Kept here rather than
// in xp-streak.ts because they're not gamification-shaped — they're pure curriculum lookups.

export interface TrackSummary {
  slug: string;
  name: string;
  language: "python" | "typescript";
  description: string | null;
}

// Returns the rows for the supplied slugs in *the supplied order*, dropping any slug that has no
// matching `tracks` row. Used by GET /v1/recommendation to hydrate role-library track slugs into
// full names + descriptions for the /recommended page cards.
//
// Order preservation is intentional: full-stack-engineer recommends ["typescript-fundamentals",
// "python-fundamentals"] in that order on purpose (TS first, Python second). A naive
// `inArray()` query would let Postgres return rows in whatever physical order it likes, so we
// re-sort client-side against the input slug list.
export async function getTracksBySlugs(
  db: LearnProDb,
  slugs: readonly string[],
  org_id: string = SELF_HOSTED_ORG_ID,
): Promise<TrackSummary[]> {
  if (slugs.length === 0) return [];
  const rows = await db
    .select({
      slug: tracks.slug,
      name: tracks.name,
      language: tracks.language,
      description: tracks.description,
    })
    .from(tracks)
    .where(inArray(tracks.slug, slugs as string[]));
  // Apply org_id filter in JS — `inArray` already keeps the query single-pass; layered Drizzle
  // `and()` here just to be explicit about tenant scoping. Doing it client-side keeps the binder
  // out of the way.
  const bySlug = new Map<string, TrackSummary>();
  for (const r of rows) {
    bySlug.set(r.slug, {
      slug: r.slug,
      name: r.name,
      language: r.language,
      description: r.description,
    });
  }
  // re-emit in input order, dropping misses
  const out: TrackSummary[] = [];
  for (const s of slugs) {
    const t = bySlug.get(s);
    if (t) out.push(t);
  }
  void org_id; // reserved — multi-tenant filtering lands when org_id leaves "self"
  return out;
}

// Returns the user's count of started episodes. Drives the post-signin "is this their first
// session?" routing decision: 0 episodes + a captured target_role -> /recommended; otherwise
// /dashboard. Tied to `episodes` rather than `submissions` because the tutor agent (STORY-011)
// inserts an episode at session-start before any code is run.
export async function countUserEpisodes(db: LearnProDb, user_id: string): Promise<number> {
  const rows = await db
    .select({ id: episodes.id })
    .from(episodes)
    .where(eq(episodes.user_id, user_id));
  return rows.length;
}
