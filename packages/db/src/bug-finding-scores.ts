import { and, asc, eq } from "drizzle-orm";
import {
  BUG_ARCHETYPES,
  BugArchetypeKeySchema,
  coldStartBugFinding,
  updateBugFindingScore,
  type BugArchetypeKey,
  type BugFindingPolicyConfig,
  type BugFindingSignalInput,
} from "@learnpro/scoring";
import type { LearnProDb } from "./client.js";
import { bug_finding_scores, SELF_HOSTED_ORG_ID } from "./schema.js";

// STORY-037a — DB helpers for the per-(user, bug_archetype) bug-finding score axis. The pure
// EWMA math lives in @learnpro/scoring's bug-finding-policy; these helpers translate the
// stored row (numeric(10,6) score/confidence; integer attempts) into the policy's domain
// types and back. Idempotent UPSERT on (user_id, bug_archetype, org_id) — the migration's
// unique index is the bedrock; ON CONFLICT DO UPDATE keeps the close-time write a single
// round trip.
//
// Why store score/confidence as numeric (and not double precision): drizzle returns numeric
// columns as strings (matches `agent_calls.cost_usd`), avoiding the 1e-15 jitter that
// floating-point storage introduces on round-trips. The policy's `round6` rule keeps
// per-write precision well within 6 decimal places.

export interface BugFindingScoreView {
  archetype: BugArchetypeKey;
  score: number;
  confidence: number;
  attempts: number;
}

function rowToView(row: {
  bug_archetype: string;
  score: string;
  confidence: string;
  attempts: number;
}): BugFindingScoreView {
  return {
    archetype: BugArchetypeKeySchema.parse(row.bug_archetype),
    score: Number(row.score),
    confidence: Number(row.confidence),
    attempts: row.attempts,
  };
}

export interface UpsertBugFindingScoreInput {
  user_id: string;
  org_id?: string;
  bug_archetype: BugArchetypeKey;
  signal: BugFindingSignalInput;
  config?: BugFindingPolicyConfig;
}

// Loads the prior score (or seeds cold-start), runs the EWMA update via
// `updateBugFindingScore`, and writes the result back via UPSERT. Returns the post-update
// view so callers (the grade-deps adapter, integration tests) can assert the new state.
//
// The `signal.got_help` branch is enforced by `updateBugFindingScore` itself — when true the
// helper returns `prev` unchanged. We still write that prev back (a fresh `updated_at`) so
// the dashboard's "untouched archetypes" filter doesn't lie about activity.
export async function upsertBugFindingScore(
  db: LearnProDb,
  input: UpsertBugFindingScoreInput,
): Promise<BugFindingScoreView> {
  const archetype = BugArchetypeKeySchema.parse(input.bug_archetype);
  const org_id = input.org_id ?? SELF_HOSTED_ORG_ID;
  const prevRows = await db
    .select({
      bug_archetype: bug_finding_scores.bug_archetype,
      score: bug_finding_scores.score,
      confidence: bug_finding_scores.confidence,
      attempts: bug_finding_scores.attempts,
    })
    .from(bug_finding_scores)
    .where(
      and(
        eq(bug_finding_scores.user_id, input.user_id),
        eq(bug_finding_scores.bug_archetype, archetype),
        eq(bug_finding_scores.org_id, org_id),
      ),
    )
    .limit(1);
  const prev = prevRows[0]
    ? rowToView(prevRows[0])
    : coldStartBugFinding(archetype);
  const next = updateBugFindingScore(prev, input.signal, input.config);

  await db
    .insert(bug_finding_scores)
    .values({
      user_id: input.user_id,
      org_id,
      bug_archetype: archetype,
      score: next.score.toString(),
      confidence: next.confidence.toString(),
      attempts: next.attempts,
      updated_at: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        bug_finding_scores.user_id,
        bug_finding_scores.bug_archetype,
        bug_finding_scores.org_id,
      ],
      set: {
        score: next.score.toString(),
        confidence: next.confidence.toString(),
        attempts: next.attempts,
        updated_at: new Date(),
      },
    });

  return next;
}

// Lists every archetype for the user, including untouched ones (zero-row archetypes appear
// at score=0.5 / confidence=0 / attempts=0 — the cold-start uniform prior). The dashboard
// uses this to surface "untouched archetype" as a learning gap without needing every user to
// have a stored row first. Sorted alphabetically for stable UI rendering.
export async function listBugFindingScores(
  db: LearnProDb,
  user_id: string,
  org_id?: string,
): Promise<BugFindingScoreView[]> {
  const orgIdValue = org_id ?? SELF_HOSTED_ORG_ID;
  const rows = await db
    .select({
      bug_archetype: bug_finding_scores.bug_archetype,
      score: bug_finding_scores.score,
      confidence: bug_finding_scores.confidence,
      attempts: bug_finding_scores.attempts,
    })
    .from(bug_finding_scores)
    .where(
      and(
        eq(bug_finding_scores.user_id, user_id),
        eq(bug_finding_scores.org_id, orgIdValue),
      ),
    )
    .orderBy(asc(bug_finding_scores.bug_archetype));

  const byArchetype = new Map<BugArchetypeKey, BugFindingScoreView>();
  for (const r of rows) {
    const view = rowToView(r);
    byArchetype.set(view.archetype, view);
  }
  const sortedArchetypes = [...BUG_ARCHETYPES].sort();
  return sortedArchetypes.map(
    (a) => byArchetype.get(a) ?? coldStartBugFinding(a),
  );
}
