import { z } from "zod";

// STORY-046 — today's plan composer. Composes today's plan at read-time from the latest active
// session_plans row + the user's due concept_reviews + a count of episodes already done today.
// No new schema, no migration — every signal comes from existing tables (STORY-015's session_plans,
// STORY-031's concept_reviews, STORY-013's episodes).
//
// Re-plan dampening: per AC #5, don't aggressively re-plan on a single missed day (false-positive
// on weekends). The composer takes a `regenerate` flag and a count of recent episodes; when the
// user has missed only 1 day (or it's a weekend), we suppress the regenerate and return the
// existing plan unchanged with a `suppressed_replan_reason`.
//
// The weekly view is intentionally NOT composed here. Weekly themed plans need a populated
// knowledge graph (STORY-032), which isn't done. The /plan UI surfaces a stub explaining the
// deferral; the composer omits weekly entirely so the API contract reflects the current capability.

export const TodayReviewItemSchema = z.object({
  concept_id: z.string().min(1),
  due: z.string().datetime(),
  days_overdue: z.number().int().min(0),
  // Reasoning text used by the advanced-toggle UI. Composed from FSRS state.due — explains *why*
  // this concept is in today's queue. Pure-function: no LLM call here.
  reasoning: z.string().min(1),
});
export type TodayReviewItem = z.infer<typeof TodayReviewItemSchema>;

export const TodaySessionPlanItemSchema = z.object({
  slug: z.string().min(1),
  objective: z.string().min(1),
  estimated_duration_min: z.number().int().positive(),
  status: z.enum(["pending", "completed"]),
  // Reasoning text for the advanced-toggle UI. Echoes the planner's `objective` field — that's
  // the planner's own justification for picking this item.
  reasoning: z.string().min(1),
});
export type TodaySessionPlanItem = z.infer<typeof TodaySessionPlanItemSchema>;

export const TodayPlanDampeningSchema = z.object({
  // When set, the regenerate request was suppressed and the existing plan was returned unchanged.
  // The UI uses this to render a friendly banner. Absent on a normal read (no regenerate flag).
  suppressed_replan_reason: z.string().min(1).optional(),
});
export type TodayPlanDampening = z.infer<typeof TodayPlanDampeningSchema>;

export const TodayPlanSchema = z.object({
  // ISO-8601 date string (YYYY-MM-DD) for the day this plan covers — derived from `now` in the
  // user's tz. MVP is UTC; tz-aware dates land with the calendar work in v2.
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  review_items: z.array(TodayReviewItemSchema),
  session_plan_items: z.array(TodaySessionPlanItemSchema),
  episodes_today_count: z.number().int().min(0),
  // The latest active session_plan's id, if one exists. Lets the UI deep-link to /session
  // without re-fetching.
  session_plan_id: z.string().uuid().nullable(),
  dampening: TodayPlanDampeningSchema,
});
export type TodayPlan = z.infer<typeof TodayPlanSchema>;

// Deps shape: the composer takes adapters for the three reads it does. apps/api wires these to
// @learnpro/db helpers; tests pass fakes.
export interface TodayPlanDeps {
  // STORY-015 — latest active session_plans row for the user, or null if none.
  getLatestActivePlan(input: { user_id: string; now: Date }): Promise<{
    id: string;
    user_id: string;
    created_at: Date;
    items: ReadonlyArray<{
      slug: string;
      objective: string;
      estimated_duration_min: number;
      status: "pending" | "completed";
    }>;
  } | null>;

  // STORY-031 — due concept ids + their FSRS state. Capped at 50 in the DB helper.
  getDueConcepts(input: { user_id: string; now: Date }): Promise<
    ReadonlyArray<{
      concept_id: string;
      state: { due: string };
    }>
  >;

  // Count of episodes the user has finished today (UTC day boundary). Drives the dampening
  // signal — "missed 0 days" if >0, otherwise look at the plan's created_at vs today.
  countTodaysEpisodes(input: { user_id: string; now: Date }): Promise<number>;
}

export interface BuildTodayPlanInput {
  user_id: string;
  now: Date;
  // When true, this is a "re-plan" request from the UI. The composer applies AC #5 dampening:
  //   - missed only 1 day → suppress
  //   - weekend (Sat/Sun) → suppress (avoid weekend false-positives)
  //   - missed >= 2 weekdays → allow the re-plan to proceed
  // The composer doesn't actually re-generate the plan here; that's the API route's job. The
  // composer's role is to compute the dampening signal so the route can act on it.
  regenerate?: boolean;
  deps: TodayPlanDeps;
}

export const SUPPRESSED_REPLAN_ONE_DAY =
  "Only one day missed — your plan still applies. Tomorrow we can re-plan if you'd like.";
export const SUPPRESSED_REPLAN_WEEKEND =
  "Weekends are part of the rhythm — keeping your plan as-is. Re-plan unlocks Monday.";

// Pure compose function. Returns the TodayPlan + a dampening signal indicating whether a
// regenerate was suppressed. The API route reads the dampening signal to decide whether to call
// the planner; the route owns persistence.
export async function buildTodayPlan(input: BuildTodayPlanInput): Promise<TodayPlan> {
  const { user_id, now, regenerate, deps } = input;
  const [activePlan, dueConcepts, todaysEpisodes] = await Promise.all([
    deps.getLatestActivePlan({ user_id, now }),
    deps.getDueConcepts({ user_id, now }),
    deps.countTodaysEpisodes({ user_id, now }),
  ]);

  const dampening: TodayPlanDampening = {};
  if (regenerate === true && activePlan) {
    const reason = computeDampeningReason({
      now,
      planCreatedAt: activePlan.created_at,
      episodesTodayCount: todaysEpisodes,
    });
    if (reason !== null) {
      dampening.suppressed_replan_reason = reason;
    }
  }

  const review_items: TodayReviewItem[] = dueConcepts.map((d) => {
    const dueMs = new Date(d.state.due).getTime();
    const days_overdue = Math.max(0, Math.floor((now.getTime() - dueMs) / 86400_000));
    return {
      concept_id: d.concept_id,
      due: d.state.due,
      days_overdue,
      reasoning: reasoningForReview(days_overdue),
    };
  });

  const session_plan_items: TodaySessionPlanItem[] =
    activePlan?.items.map((it) => ({
      slug: it.slug,
      objective: it.objective,
      estimated_duration_min: it.estimated_duration_min,
      status: it.status,
      reasoning: reasoningForPlanItem(it),
    })) ?? [];

  const date = isoDate(now);

  return {
    date,
    review_items,
    session_plan_items,
    episodes_today_count: todaysEpisodes,
    session_plan_id: activePlan?.id ?? null,
    dampening,
  };
}

// Returns a dampening reason string (suppressing the re-plan), or null if the re-plan should
// proceed. The rules:
//
//   - User has done at least 1 episode today → "missed 0 days" → no dampening (the regenerate
//     will return a fresh plan reflecting today's work). This avoids a thrash where the
//     re-plan button does nothing right after an active session.
//   - It's a weekend (Sat or Sun) → suppress. Per AC #5: don't be aggressive on weekends. The
//     user can always come back Monday.
//   - The plan is at most 1 calendar day old AND the user has done 0 episodes today → 1 missed
//     day → suppress.
//   - Otherwise (>= 2 missed days on a weekday) → no dampening.
//
// `now` is treated in UTC; converting to user-local-tz lands with the calendar work in v2.
export function computeDampeningReason(input: {
  now: Date;
  planCreatedAt: Date;
  episodesTodayCount: number;
}): string | null {
  const { now, planCreatedAt, episodesTodayCount } = input;
  if (episodesTodayCount > 0) return null;
  if (isWeekend(now)) return SUPPRESSED_REPLAN_WEEKEND;
  const daysSincePlan = daysBetween(planCreatedAt, now);
  if (daysSincePlan <= 1) return SUPPRESSED_REPLAN_ONE_DAY;
  return null;
}

function daysBetween(earlier: Date, later: Date): number {
  const start = startOfUtcDay(earlier);
  const end = startOfUtcDay(later);
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400_000));
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function isWeekend(d: Date): boolean {
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

function isoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Coach-voice reasoning text for review items. Conveys the *why* without urgency / shame.
export function reasoningForReview(daysOverdue: number): string {
  if (daysOverdue <= 0) {
    return "Due today by your spaced-repetition schedule — a quick refresh keeps it sharp.";
  }
  if (daysOverdue === 1) {
    return "Due 1 day ago — a short review will bring it back to where it was.";
  }
  return `Due ${daysOverdue} days ago — a few minutes here will keep this concept solid.`;
}

// Coach-voice reasoning text for session plan items. Echoes the planner's objective + status.
export function reasoningForPlanItem(item: {
  objective: string;
  status: "pending" | "completed";
}): string {
  if (item.status === "completed") {
    return `Already done today: ${item.objective}`;
  }
  return `Picked by your session planner: ${item.objective}`;
}
