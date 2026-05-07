import { z } from "zod";
import { topologicalOrder } from "@learnpro/db";

// STORY-046b — weekly themed plan composer. Pure read-time function: walks the user's track in
// topological order from their current "frontier" (latest concept they've passed), picks the next
// 3-5 concepts and frames them as a coherent week (e.g., "List comprehensions and generators
// week"). Adaptive: when the user has fallen behind by ≥2 weekdays, re-shuffle by skipping ahead
// fewer concepts; when they accelerate (≥2x expected pace), expand to the next concept group.
//
// Re-plan dampening rules mirror STORY-046's daily-replan: 1-day-miss / weekend → suppressed.
//
// LLM-generated theme names are intentionally NOT used here. v1 uses the dominant concept's
// `name` field as the theme ("List comprehensions and generators week"). LLM-gen is a follow-up
// story.
//
// Inputs:
//   - track_id, user_id, today
//   - conceptGraph: the populated knowledge graph from STORY-032 (concepts list + edges).
//     Optional: when not populated, we fall back to a "no-graph" mode that picks the next N
//     concepts in declaration order — the API route returns 503 in that branch so the UI surfaces
//     a friendly explainer rather than a fake plan.
//   - recentEpisodes: newest-first list of the user's last ~30 episodes scoped to the track.
//     Drives both the frontier (what they passed) and the pacing signal (≥2 weekdays-behind /
//     accelerated detection).
//   - dueReviews: spaced-rep concept ids that are due now. Surfaced informationally on the weekly
//     plan ("X concepts are also due for a review this week") — not part of the theme picker.
//   - target_role: optional bias from the profile; influences theme selection when there are
//     ties (e.g., a backend-engineer's track week leans toward concepts tagged `data-modeling`).

export const WeeklyPlanDayConceptSchema = z.object({
  day_index: z.number().int().min(0).max(6),
  concept_slug: z.string().min(1),
  reasoning: z.string().min(1),
});
export type WeeklyPlanDayConcept = z.infer<typeof WeeklyPlanDayConceptSchema>;

export const WeeklyPlanDampeningSchema = z.object({
  // When set, the regenerate request was suppressed and the existing/composed plan was returned
  // unchanged. The UI uses this to render a friendly banner. Absent on a normal read.
  suppressed_replan_reason: z.string().min(1).optional(),
  // When set, an adaptive adjustment was applied to the picked concepts: either "behind" (the
  // user fell ≥2 weekdays behind and we trimmed the next-group expansion) or "accelerated" (the
  // user is ≥2x expected pace and we expanded into the next concept group). Pure-information; the
  // theme picker has already applied the adjustment by the time this is read.
  adaptive_adjustment_reason: z.string().min(1).optional(),
});
export type WeeklyPlanDampening = z.infer<typeof WeeklyPlanDampeningSchema>;

export const WeeklyPlanSchema = z.object({
  // ISO-8601 date string for the Monday of the week (or whatever weekStartsOn picks). UTC for now;
  // tz-aware dates land with the calendar work in v2.
  week_start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  // Empty when no theme could be picked (no graph populated for the track). The route returns
  // 503 when theme_concept_slug is empty so the UI can render a friendly explainer.
  theme: z.string(),
  theme_concept_slug: z.string(),
  daily_concepts: z.array(WeeklyPlanDayConceptSchema).max(7),
  // The 3-5 concepts the week is "about". These feed the theme + are repeated across daily
  // suggestions. Empty when no theme could be picked.
  theme_concepts: z.array(z.string().min(1)),
  due_reviews_count: z.number().int().min(0),
  dampening: WeeklyPlanDampeningSchema,
});
export type WeeklyPlan = z.infer<typeof WeeklyPlanSchema>;

// Concept graph adapter. apps/api builds this from @learnpro/db's seeded concepts + prerequisites
// rows; tests pass a fake. We accept ReadonlyArrays to keep the function deterministic.
export interface WeeklyPlanConceptGraph {
  // The slugs of all concepts known to the system. Includes both track-fundamentals and
  // cross-track concepts.
  concepts: ReadonlyArray<{
    slug: string;
    name: string;
    track_slugs: ReadonlyArray<string>;
    tags: ReadonlyArray<string>;
  }>;
  edges: ReadonlyArray<{ from: string; to: string }>;
}

export interface WeeklyPlanRecentEpisode {
  // Concept slugs the episode touched — surfaced via problem.concept_tags. Newest-first.
  concept_slugs: ReadonlyArray<string>;
  final_outcome: "pass" | "fail" | "abandoned" | null;
  started_at: Date;
}

export interface WeeklyPlanDueReview {
  concept_slug: string;
}

export interface BuildWeeklyPlanInput {
  user_id: string;
  track_slug: string;
  today: Date;
  // ISO weekday number 1..7 where 1=Monday, 7=Sunday. Defaults to 1 (Monday). Other values are
  // accepted but the helper always emits 7 day rows with day_index 0..6 starting from
  // week-start.
  weekStartsOn?: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  conceptGraph: WeeklyPlanConceptGraph;
  recentEpisodes: ReadonlyArray<WeeklyPlanRecentEpisode>;
  dueReviews: ReadonlyArray<WeeklyPlanDueReview>;
  // Optional bias from the profile (target_role like "backend-engineer", "ml-engineer"). When
  // multiple concept slots are equivalently topologically-next, role-aligned tags break the tie.
  targetRole?: string | null;
  regenerate?: boolean;
  // The Date when the previous weekly plan was created. When provided, dampening checks against
  // it for the AC-mirrored 1-day-miss / weekend rules. When absent, no dampening is signalled
  // (no prior plan to suppress against).
  previousPlanCreatedAt?: Date;
  // Episodes done today (or this week's start day). Drives the active-user dampening branch
  // (regenerate when episodes_today > 0).
  episodesTodayCount?: number;
}

export const SUPPRESSED_REPLAN_ONE_DAY_WEEKLY =
  "Only one day missed — your weekly plan still applies. Tomorrow we can re-plan if you'd like.";
export const SUPPRESSED_REPLAN_WEEKEND_WEEKLY =
  "Weekends are part of the rhythm — keeping your weekly plan as-is. Re-plan unlocks Monday.";

const DEFAULT_THEME_CONCEPT_COUNT = 3;
const MAX_THEME_CONCEPT_COUNT = 5;

export function buildWeeklyPlan(input: BuildWeeklyPlanInput): WeeklyPlan {
  const {
    track_slug,
    today,
    weekStartsOn = 1,
    conceptGraph,
    recentEpisodes,
    dueReviews,
    targetRole = null,
    regenerate = false,
    previousPlanCreatedAt,
    episodesTodayCount = 0,
  } = input;

  const dampening: WeeklyPlanDampening = {};
  if (regenerate === true && previousPlanCreatedAt !== undefined) {
    const reason = computeWeeklyDampeningReason({
      now: today,
      planCreatedAt: previousPlanCreatedAt,
      episodesTodayCount,
    });
    if (reason !== null) {
      dampening.suppressed_replan_reason = reason;
    }
  }

  const trackConcepts = filterTrackConcepts(conceptGraph, track_slug);
  const trackSlugs = trackConcepts.map((c) => c.slug);

  // If the graph has zero concepts on this track, we can't pick a theme. Return an empty plan
  // shape (the API route returns 503 in this branch).
  if (trackSlugs.length === 0) {
    return {
      week_start_date: isoDate(weekStart(today, weekStartsOn)),
      theme: "",
      theme_concept_slug: "",
      daily_concepts: [],
      theme_concepts: [],
      due_reviews_count: dueReviews.length,
      dampening,
    };
  }

  const trackEdges = filterTrackEdges(conceptGraph.edges, new Set(trackSlugs));
  let topoOrder: string[];
  try {
    topoOrder = topologicalOrder(trackSlugs, trackEdges);
  } catch {
    // Cycle in the graph — fall back to declaration order so we never 500. The graph CI
    // gate (STORY-032) catches cycles before they reach prod.
    topoOrder = [...trackSlugs];
  }

  const passedSlugs = collectPassedSlugs(recentEpisodes);
  const frontierIndex = computeFrontierIndex(topoOrder, passedSlugs);

  const paceSignal = classifyPace({ recentEpisodes, today });
  const targetCount = pickThemeConceptCount(paceSignal);

  // Walk forward from frontierIndex. Skip any slug already in passedSlugs (defensive — the
  // frontierIndex already points past passed concepts, but a partial-pass set may include
  // out-of-order entries).
  const candidates: string[] = [];
  for (let i = frontierIndex; i < topoOrder.length && candidates.length < targetCount; i++) {
    const slug = topoOrder[i];
    if (slug === undefined) continue;
    if (passedSlugs.has(slug)) continue;
    candidates.push(slug);
  }

  // Optional role-based reordering: if `targetRole` matches any of a candidate's tags
  // case-insensitively, that candidate gets bubbled toward the front (preserving relative order
  // among equally-matching items). Pure tie-breaker — never displaces a topologically-required
  // concept.
  const roleBiased = applyRoleBias(candidates, conceptGraph.concepts, targetRole);

  if (roleBiased.length === 0) {
    return {
      week_start_date: isoDate(weekStart(today, weekStartsOn)),
      theme: "",
      theme_concept_slug: "",
      daily_concepts: [],
      theme_concepts: [],
      due_reviews_count: dueReviews.length,
      dampening,
    };
  }

  const themeSlug = roleBiased[0]!;
  const themeConcept = conceptGraph.concepts.find((c) => c.slug === themeSlug);
  const themeName = themeConcept?.name ?? themeSlug;
  const theme = `${themeName} week`;
  const dailyConcepts = composeDailySuggestions(roleBiased);

  // Adaptive-adjustment annotation. Mirrors AC: behind ≥2 weekdays / accelerated ≥2x. Pure
  // information for the UI banner — the picker has already applied the adjustment by the
  // time we set this.
  if (paceSignal === "behind") {
    dampening.adaptive_adjustment_reason =
      "You missed a couple of recent weekdays — we trimmed this week's stretch to keep it doable.";
  } else if (paceSignal === "accelerated") {
    dampening.adaptive_adjustment_reason =
      "You've been ahead of pace — this week stretches into the next concept group.";
  }

  return {
    week_start_date: isoDate(weekStart(today, weekStartsOn)),
    theme,
    theme_concept_slug: themeSlug,
    daily_concepts: dailyConcepts,
    theme_concepts: roleBiased,
    due_reviews_count: dueReviews.length,
    dampening,
  };
}

// Same dampening shape as STORY-046's today-plan composer, just over the weekly-plan create date.
export function computeWeeklyDampeningReason(input: {
  now: Date;
  planCreatedAt: Date;
  episodesTodayCount: number;
}): string | null {
  const { now, planCreatedAt, episodesTodayCount } = input;
  if (episodesTodayCount > 0) return null;
  if (isWeekend(now)) return SUPPRESSED_REPLAN_WEEKEND_WEEKLY;
  const daysSincePlan = daysBetween(planCreatedAt, now);
  if (daysSincePlan <= 1) return SUPPRESSED_REPLAN_ONE_DAY_WEEKLY;
  return null;
}

// Reasoning text for a suggested concept on a given day. Echoes the picker's intent in coach
// voice — no urgency / shame.
export function reasoningForDailyConcept(input: {
  conceptName: string;
  themeConceptName: string;
  dayIndex: number;
}): string {
  const { conceptName, themeConceptName, dayIndex } = input;
  if (conceptName === themeConceptName) {
    return `Theme of the week — keep coming back to ${conceptName} so it sticks.`;
  }
  if (dayIndex >= 5) {
    return `A change of pace within the ${themeConceptName} theme — light practice for the weekend.`;
  }
  return `Builds on ${themeConceptName}; one short session here keeps the chain solid.`;
}

// === Internal helpers ===

function filterTrackConcepts(
  graph: WeeklyPlanConceptGraph,
  track_slug: string,
): Array<{ slug: string; name: string; tags: ReadonlyArray<string> }> {
  return graph.concepts
    .filter((c) => c.track_slugs.includes(track_slug))
    .map((c) => ({ slug: c.slug, name: c.name, tags: c.tags }));
}

function filterTrackEdges(
  edges: ReadonlyArray<{ from: string; to: string }>,
  trackSlugSet: ReadonlySet<string>,
): Array<{ from: string; to: string }> {
  return edges.filter((e) => trackSlugSet.has(e.from) && trackSlugSet.has(e.to));
}

function collectPassedSlugs(
  recentEpisodes: ReadonlyArray<WeeklyPlanRecentEpisode>,
): Set<string> {
  const passed = new Set<string>();
  for (const ep of recentEpisodes) {
    if (ep.final_outcome !== "pass") continue;
    for (const slug of ep.concept_slugs) passed.add(slug);
  }
  return passed;
}

// Returns the index in `topoOrder` of the first concept the user has NOT yet passed. Examples:
//   - User has passed nothing → returns 0.
//   - User has passed the first 3 in topo order → returns 3 (the next unpassed).
//   - User has passed concepts but they're scattered (e.g., they have passed #5 but not #2-4)
//     → returns 2 (the first unpassed). The picker walks forward from there, skipping any
//     already-passed slugs along the way.
function computeFrontierIndex(topoOrder: ReadonlyArray<string>, passed: ReadonlySet<string>): number {
  for (let i = 0; i < topoOrder.length; i++) {
    const slug = topoOrder[i];
    if (slug === undefined) continue;
    if (!passed.has(slug)) return i;
  }
  return topoOrder.length;
}

type PaceSignal = "behind" | "on-pace" | "accelerated";

// Pure pace classifier. Counts the user's pass-episodes in the last 7 days and compares to a
// rough "expected pace" (1 pass per weekday → ≈5 / week). Below 2 → "behind"; above 10
// (≥2x expected) → "accelerated"; otherwise "on-pace".
//
// Conservative thresholds: the AC says "≥2 weekdays-behind" / "≥2x expected pace". We approximate
// "≥2 weekdays-behind" as <2 passes in the last 7 days (i.e., the user has barely engaged), and
// ">=2x expected pace" as >=10 passes in the last 7 days. Tunable via constants in this fn.
function classifyPace(input: {
  recentEpisodes: ReadonlyArray<WeeklyPlanRecentEpisode>;
  today: Date;
}): PaceSignal {
  const { recentEpisodes, today } = input;
  const weekAgo = today.getTime() - 7 * 86400_000;
  let recentPasses = 0;
  for (const ep of recentEpisodes) {
    if (ep.final_outcome !== "pass") continue;
    if (ep.started_at.getTime() < weekAgo) continue;
    recentPasses++;
  }
  if (recentPasses < 2) return "behind";
  if (recentPasses >= 10) return "accelerated";
  return "on-pace";
}

function pickThemeConceptCount(pace: PaceSignal): number {
  if (pace === "behind") return DEFAULT_THEME_CONCEPT_COUNT;
  if (pace === "accelerated") return MAX_THEME_CONCEPT_COUNT;
  return 4;
}

function applyRoleBias(
  candidates: ReadonlyArray<string>,
  catalog: WeeklyPlanConceptGraph["concepts"],
  targetRole: string | null,
): string[] {
  if (targetRole === null || targetRole.length === 0) return [...candidates];
  const role = targetRole.toLowerCase();
  const tagsBySlug = new Map<string, ReadonlyArray<string>>();
  for (const c of catalog) tagsBySlug.set(c.slug, c.tags);

  // Stable partition: matching first, then non-matching, both in original order.
  const matching: string[] = [];
  const others: string[] = [];
  for (const slug of candidates) {
    const tags = tagsBySlug.get(slug) ?? [];
    const isMatch = tags.some((t) => t.toLowerCase() === role || role.includes(t.toLowerCase()));
    if (isMatch) matching.push(slug);
    else others.push(slug);
  }
  return [...matching, ...others];
}

// Composes 7 daily suggestions from the theme concepts. The week-day mapping rotates through the
// concept list — the theme concept (index 0) is repeated more often to make the week coherent.
function composeDailySuggestions(themeConcepts: ReadonlyArray<string>): WeeklyPlanDayConcept[] {
  const out: WeeklyPlanDayConcept[] = [];
  if (themeConcepts.length === 0) return out;
  const themeSlug = themeConcepts[0]!;
  for (let day = 0; day < 7; day++) {
    // Day 0 (Monday) and day 4 (Friday) are theme days — the dominant concept anchors the week.
    // Days 1-3 + 5 cycle through the remaining concepts. Day 6 (Sunday) is light: the theme
    // concept again with a "change of pace" reasoning.
    const isThemeDay = day === 0 || day === 4 || day === 6;
    const slug = isThemeDay
      ? themeSlug
      : themeConcepts[(day % Math.max(1, themeConcepts.length)) || 1] ?? themeSlug;
    const reasoning = reasoningForDailyConcept({
      conceptName: slug,
      themeConceptName: themeSlug,
      dayIndex: day,
    });
    out.push({ day_index: day, concept_slug: slug, reasoning });
  }
  return out;
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

// Given `today`, returns the start of the week per `weekStartsOn` (1..7 ISO; 1=Mon). UTC.
function weekStart(today: Date, weekStartsOn: number): Date {
  const d = startOfUtcDay(today);
  // JS getUTCDay: 0=Sun, 1=Mon, ..., 6=Sat. ISO: 1=Mon, ..., 7=Sun. Convert weekStartsOn (ISO)
  // to JS day-of-week.
  const jsTargetDow = weekStartsOn === 7 ? 0 : weekStartsOn;
  const currentJs = d.getUTCDay();
  // Days to subtract to get back to target dow.
  const offset = (currentJs - jsTargetDow + 7) % 7;
  return new Date(d.getTime() - offset * 86400_000);
}
