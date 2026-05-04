import { and, eq, lt, sql } from "drizzle-orm";
import type { LearnProDb } from "./client.js";
import { episodes, interactions } from "./schema.js";

// STORY-056 — retention sweepers. Each sweeper enforces one of the windows from
// `docs/security/RETENTION.md`:
//
//   - Raw LLM prompts/responses → 90 days (no-op until a future Story adds raw-text columns).
//   - Voice transcripts → 30 days (delete the row outright — lower blast radius than NULL'ing
//     the payload because the row's metadata still implies voice was captured).
//   - Interaction telemetry (excluding voice) → 90 days (aggregate per-episode then delete).
//
// All sweepers are idempotent: they filter on a `now - retention` cutoff, so re-running inside
// the same window touches zero rows after the first sweep.

export interface SweepOptions {
  // The current wall-clock time. Tests pass a fixed Date for determinism. Production passes
  // `new Date()`.
  now: Date;
  // Override the retention window (in days). Defaults documented per-sweeper. Set to 0 only for
  // a manual purge — operators should NEVER set this in normal rotation.
  max_age_days?: number;
}

// `DEFAULT_RAW_LLM_DAYS = 90` lives in `docs/security/RETENTION.md` and gets pulled into the
// raw-LLM sweeper once raw-text columns land. Keeping the constant inline-only for now to avoid
// the lint warning on an unused export.
const DEFAULT_VOICE_DAYS = 30;
const DEFAULT_INTERACTION_DAYS = 90;

// Sweeper 1 — raw LLM prompts/responses.
//
// `agent_calls` currently stores aggregates only (model / tokens / cost / latency). There are no
// raw-prompt or raw-response text columns yet. This sweeper is a no-op until a future Story adds
// those columns; once it does, this body becomes:
//
//   const cutoff = subtractDays(opts.now, days);
//   const result = await db.update(agent_calls)
//     .set({ raw_prompt: null, raw_response: null })
//     .where(and(lt(agent_calls.called_at, cutoff), isNotNull(agent_calls.raw_prompt)))
//     .returning({ id: agent_calls.id });
//   return result.length;
//
// Returning 0 is the right default in MVP — the function can be wired into the cron right now,
// and the day raw columns land they're auto-NULL'd without re-wiring the cron. Aggregate fields
// are kept so the cost/usage history survives indefinitely.
export async function sweepRawLlmCalls(_db: LearnProDb, _opts: SweepOptions): Promise<number> {
  return 0;
}

// Sweeper 2 — voice transcripts (interactions where type='voice').
//
// We DELETE the row rather than NULL'ing the payload. Two reasons:
//   1) Even an empty payload row implies the user spoke at time T — that's still leakage.
//   2) The interactions table has a per-episode aggregate (`episodes.interactions_summary`)
//      that records counts; the deleted voice rows are still represented in the rollup.
export async function sweepVoiceTranscripts(db: LearnProDb, opts: SweepOptions): Promise<number> {
  const days = opts.max_age_days ?? DEFAULT_VOICE_DAYS;
  const cutoff = subtractDays(opts.now, days);
  const result = await db
    .delete(interactions)
    .where(and(eq(interactions.type, "voice"), lt(interactions.t, cutoff)))
    .returning({ id: interactions.id });
  return result.length;
}

// Sweeper 3 — interaction telemetry (everything except voice; voice has its own sweeper).
//
// For each affected episode we update `episodes.interactions_summary` with a per-type count +
// first/last timestamp, then delete the raw rows. The summary update is idempotent: if a sweep
// runs twice in the same window, the second sweep has no rows to delete and the summary update
// is a no-op SELECT (all counts are already 0 for the cutoff window).
export async function sweepInteractionTelemetry(
  db: LearnProDb,
  opts: SweepOptions,
): Promise<number> {
  const days = opts.max_age_days ?? DEFAULT_INTERACTION_DAYS;
  const cutoff = subtractDays(opts.now, days);

  // 1. Pull aggregate stats grouped by episode_id, for non-voice rows older than the cutoff.
  const aggregateRows = await db
    .select({
      episode_id: interactions.episode_id,
      type: interactions.type,
      count: sql<number>`COUNT(*)::int`.as("count"),
      first_t: sql<Date>`MIN(${interactions.t})`.as("first_t"),
      last_t: sql<Date>`MAX(${interactions.t})`.as("last_t"),
    })
    .from(interactions)
    .where(
      and(
        lt(interactions.t, cutoff),
        sql`${interactions.type} != 'voice'`,
        sql`${interactions.episode_id} IS NOT NULL`,
      ),
    )
    .groupBy(interactions.episode_id, interactions.type);

  // 2. Group by episode → merge into `interactions_summary`. We re-read the current summary so
  //    repeated sweeps don't clobber prior aggregates.
  const byEpisode = new Map<string, AggregateForEpisode[]>();
  for (const row of aggregateRows) {
    if (!row.episode_id) continue;
    const list = byEpisode.get(row.episode_id) ?? [];
    list.push({
      type: row.type,
      count: row.count,
      first_t: new Date(row.first_t),
      last_t: new Date(row.last_t),
    });
    byEpisode.set(row.episode_id, list);
  }

  for (const [episodeId, aggregates] of byEpisode) {
    const existing = await db
      .select({ summary: episodes.interactions_summary })
      .from(episodes)
      .where(eq(episodes.id, episodeId))
      .limit(1);
    const merged = mergeSummary(existing[0]?.summary ?? null, aggregates);
    await db
      .update(episodes)
      .set({ interactions_summary: merged })
      .where(eq(episodes.id, episodeId));
  }

  // 3. Delete the raw rows (non-voice, older than cutoff).
  const result = await db
    .delete(interactions)
    .where(and(lt(interactions.t, cutoff), sql`${interactions.type} != 'voice'`))
    .returning({ id: interactions.id });
  return result.length;
}

// Top-level entrypoint — invoked by the `db:retention` script. Each sweeper is wrapped in its own
// try/catch so a failure in one doesn't block the others. Returns per-sweeper counts (and
// errors) so the operator's log shows what happened.
export interface SweepAllResult {
  raw_llm: { rows: number; error?: string };
  voice: { rows: number; error?: string };
  interactions: { rows: number; error?: string };
}

export async function sweepAll(db: LearnProDb, now: Date): Promise<SweepAllResult> {
  const out: SweepAllResult = {
    raw_llm: { rows: 0 },
    voice: { rows: 0 },
    interactions: { rows: 0 },
  };

  try {
    out.raw_llm.rows = await sweepRawLlmCalls(db, { now });
  } catch (err) {
    out.raw_llm.error = err instanceof Error ? err.message : String(err);
  }
  try {
    out.voice.rows = await sweepVoiceTranscripts(db, { now });
  } catch (err) {
    out.voice.error = err instanceof Error ? err.message : String(err);
  }
  try {
    out.interactions.rows = await sweepInteractionTelemetry(db, { now });
  } catch (err) {
    out.interactions.error = err instanceof Error ? err.message : String(err);
  }
  return out;
}

interface AggregateForEpisode {
  type: string;
  count: number;
  first_t: Date;
  last_t: Date;
}

interface PerTypeSummary {
  count: number;
  first_t: string;
  last_t: string;
}

interface InteractionsSummaryShape {
  per_type?: Record<string, PerTypeSummary>;
}

function mergeSummary(
  existing: unknown,
  aggregates: AggregateForEpisode[],
): InteractionsSummaryShape {
  const base: InteractionsSummaryShape =
    existing && typeof existing === "object" && existing !== null
      ? (existing as InteractionsSummaryShape)
      : {};
  const perType = { ...(base.per_type ?? {}) };
  for (const agg of aggregates) {
    const prior = perType[agg.type];
    const priorFirst = prior?.first_t ? new Date(prior.first_t) : null;
    const priorLast = prior?.last_t ? new Date(prior.last_t) : null;
    perType[agg.type] = {
      count: (prior?.count ?? 0) + agg.count,
      first_t: minDate(priorFirst, agg.first_t).toISOString(),
      last_t: maxDate(priorLast, agg.last_t).toISOString(),
    };
  }
  return { ...base, per_type: perType };
}

function minDate(a: Date | null, b: Date): Date {
  if (!a) return b;
  return a.getTime() < b.getTime() ? a : b;
}

function maxDate(a: Date | null, b: Date): Date {
  if (!a) return b;
  return a.getTime() > b.getTime() ? a : b;
}

function subtractDays(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}
