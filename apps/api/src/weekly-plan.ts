import { z } from "zod";
import type { FastifyInstance } from "fastify";
import {
  buildWeeklyPlan,
  generateWeeklyTheme,
  WeeklyPlanSchema,
  type WeeklyPlan,
  type WeeklyPlanConceptGraph,
  type WeeklyPlanDueReview,
  type WeeklyPlanRecentEpisode,
  type WeeklyPlanThemeGenerator,
} from "@learnpro/agent";
import type { LLMProvider } from "@learnpro/llm";
import type { SessionResolver } from "./session.js";

// STORY-046b — weekly themed plan routes:
//   GET  /v1/weekly-plan?track_slug=...   — composed read of the week's theme + per-day suggestions
//   POST /v1/weekly-plan/replan           — re-plan request; same dampening rules as STORY-046's
//                                            daily-replan (1-day-miss / weekend → suppressed)
//
// The composer (`buildWeeklyPlan`) is pure and lives in @learnpro/agent. This file's job is to
// wire the read-side adapters (concept graph + recent episodes + due reviews) and persist a
// "previous plan created at" marker so dampening can compare against it. The marker lives in
// `weekly_plan_marker_at` query / response field — there's no new DB schema; we re-use the
// active session_plan's created_at the same way STORY-046's today-plan route does.
//
// STORY-046c — optional `themeGenerator` (LLM-backed) is wired only on the replan path. The
// GET path leaves it undefined so a normal render never fires an LLM call. Operators can
// disable the feature via `LEARNPRO_WEEKLY_THEME_LLM=0`.

export interface WeeklyPlanRouteOptions {
  weeklyPlanDeps: WeeklyPlanDeps;
  sessionResolver: SessionResolver;
  // ISO weekday number 1..7 where 1=Monday, 7=Sunday. Defaults to 1 (Monday).
  weekStartsOn?: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  // STORY-046c — optional LLM-backed theme generator. When supplied, the replan path fires
  // it once per call. The GET path NEVER fires it (cost gate). Defaults to no-LLM (the
  // STORY-046b deterministic theme behavior).
  themeGenerator?: WeeklyPlanThemeGenerator;
}

// Read-side deps surface. apps/api wires these to @learnpro/db helpers; tests pass fakes.
export interface WeeklyPlanDeps {
  // Returns the user's active track slug (latest one with episodes). When null, the route returns
  // 503 weekly_plan_unavailable and the UI surfaces the friendly explainer.
  getActiveTrackSlug(input: { user_id: string }): Promise<string | null>;

  // Returns the populated concept graph (concepts + prerequisite edges). When the graph is empty
  // for the user's track, the route returns 503 — we never fake the weekly view.
  getConceptGraph(input: { track_slug: string }): Promise<WeeklyPlanConceptGraph>;

  // Returns the user's recent episodes (last ~30) scoped to the track, newest-first. Used by the
  // theme picker to compute the frontier and the pace signal.
  getRecentEpisodes(input: {
    user_id: string;
    track_slug: string;
  }): Promise<ReadonlyArray<WeeklyPlanRecentEpisode>>;

  // Returns the user's due concept reviews (FSRS state.due <= now). Surfaced informationally on
  // the weekly plan ("X concepts also due for review this week").
  getDueReviews(input: { user_id: string; now: Date }): Promise<ReadonlyArray<WeeklyPlanDueReview>>;

  // Returns the user's target_role from the profile (drives role-bias tie-breaks). Optional —
  // null/missing is fine.
  getTargetRole(input: { user_id: string }): Promise<string | null>;

  // Returns the date the user's last weekly plan was "marked" (used by dampening). v1 uses the
  // active session_plan's created_at as a proxy — we don't add a new table for this. When null,
  // dampening doesn't fire (no prior plan to suppress against).
  getPreviousMarkerAt(input: { user_id: string }): Promise<Date | null>;

  // Count episodes done today (UTC day). Drives the active-user dampening branch.
  countTodaysEpisodes(input: { user_id: string; now: Date }): Promise<number>;
}

const TrackSlugQuerySchema = z.object({
  track_slug: z.string().min(1).optional(),
});

export function registerWeeklyPlanRoutes(app: FastifyInstance, opts: WeeklyPlanRouteOptions): void {
  const weekStartsOn = opts.weekStartsOn ?? 1;
  const themeGenerator = opts.themeGenerator;

  app.get("/v1/weekly-plan", async (req, reply) => {
    const session = await opts.sessionResolver(req);
    if (!session) return reply.code(401).send({ error: "unauthorized" });

    const parsed = TrackSlugQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request", issues: parsed.error.issues });
    }

    const trackSlug =
      parsed.data.track_slug ??
      (await opts.weeklyPlanDeps.getActiveTrackSlug({ user_id: session.user_id }));
    if (!trackSlug) {
      return reply.code(503).send({
        error: "weekly_plan_unavailable",
        message:
          "Weekly plans need a track with some practice on it. Start a session and your weekly theme will appear here.",
      });
    }

    // Cost gate: GETs never fire the LLM theme generator. Only the replan path does.
    const plan = await composeWeekly({
      user_id: session.user_id,
      trackSlug,
      now: new Date(),
      weekStartsOn,
      deps: opts.weeklyPlanDeps,
      regenerate: false,
    });
    if (plan === null) {
      return reply.code(503).send({
        error: "weekly_plan_unavailable",
        message:
          "Weekly themes draw on the populated knowledge graph. The graph for your track isn't seeded yet — your theme will appear once it's in place.",
      });
    }
    return reply.code(200).send({ weekly_plan: serialize(plan), track_slug: trackSlug });
  });

  app.post("/v1/weekly-plan/replan", async (req, reply) => {
    const session = await opts.sessionResolver(req);
    if (!session) return reply.code(401).send({ error: "unauthorized" });

    const parsed = TrackSlugQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request", issues: parsed.error.issues });
    }

    const trackSlug =
      parsed.data.track_slug ??
      (await opts.weeklyPlanDeps.getActiveTrackSlug({ user_id: session.user_id }));
    if (!trackSlug) {
      return reply.code(503).send({
        error: "weekly_plan_unavailable",
        message:
          "Weekly plans need a track with some practice on it. Start a session and your weekly theme will appear here.",
      });
    }

    // STORY-046c — fire the LLM theme generator on replan only. Cost: ~1 Haiku call per
    // replan request. When `themeGenerator` is undefined (env-disabled or feature-off),
    // the composer falls back to STORY-046b's deterministic theme behavior.
    const plan = await composeWeekly({
      user_id: session.user_id,
      trackSlug,
      now: new Date(),
      weekStartsOn,
      deps: opts.weeklyPlanDeps,
      regenerate: true,
      ...(themeGenerator !== undefined ? { themeGenerator } : {}),
    });
    if (plan === null) {
      return reply.code(503).send({
        error: "weekly_plan_unavailable",
        message:
          "Weekly themes draw on the populated knowledge graph. The graph for your track isn't seeded yet — your theme will appear once it's in place.",
      });
    }

    if (plan.dampening.suppressed_replan_reason !== undefined) {
      return reply.code(200).send({
        weekly_plan: serialize(plan),
        dampened: true,
        reason: plan.dampening.suppressed_replan_reason,
        track_slug: trackSlug,
      });
    }

    return reply.code(200).send({
      weekly_plan: serialize(plan),
      dampened: false,
      track_slug: trackSlug,
    });
  });
}

interface ComposeInput {
  user_id: string;
  trackSlug: string;
  now: Date;
  weekStartsOn: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  deps: WeeklyPlanDeps;
  regenerate: boolean;
  themeGenerator?: WeeklyPlanThemeGenerator;
}

async function composeWeekly(input: ComposeInput): Promise<WeeklyPlan | null> {
  const { user_id, trackSlug, now, weekStartsOn, deps, regenerate, themeGenerator } = input;
  const [graph, recentEpisodes, dueReviews, targetRole, previousMarkerAt, episodesToday] =
    await Promise.all([
      deps.getConceptGraph({ track_slug: trackSlug }),
      deps.getRecentEpisodes({ user_id, track_slug: trackSlug }),
      deps.getDueReviews({ user_id, now }),
      deps.getTargetRole({ user_id }),
      deps.getPreviousMarkerAt({ user_id }),
      deps.countTodaysEpisodes({ user_id, now }),
    ]);
  if (graph.concepts.length === 0) return null;

  const optionalPrev: { previousPlanCreatedAt?: Date } = {};
  if (previousMarkerAt !== null) optionalPrev.previousPlanCreatedAt = previousMarkerAt;
  const optionalRole: { targetRole?: string | null } = {};
  if (targetRole !== null) optionalRole.targetRole = targetRole;
  const optionalThemeGen: { themeGenerator?: WeeklyPlanThemeGenerator } = {};
  if (themeGenerator !== undefined) optionalThemeGen.themeGenerator = themeGenerator;

  return buildWeeklyPlan({
    user_id,
    track_slug: trackSlug,
    today: now,
    weekStartsOn,
    conceptGraph: graph,
    recentEpisodes,
    dueReviews,
    regenerate,
    episodesTodayCount: episodesToday,
    ...optionalPrev,
    ...optionalRole,
    ...optionalThemeGen,
  });
}

function serialize(plan: WeeklyPlan): WeeklyPlan {
  return WeeklyPlanSchema.parse(plan);
}

// === STORY-046c — LLM theme generator wiring ===

export interface BuildLLMThemeGeneratorOptions {
  llm: LLMProvider;
}

// Builds a `WeeklyPlanThemeGenerator` from an LLMProvider. The function adapts the
// agent's `generateWeeklyTheme` to the buildWeeklyPlan dep contract — concept shape
// passes through unchanged. Errors / null returns from the agent surface as null so
// `buildWeeklyPlan` falls back to STORY-046b's deterministic theme.
export function buildLLMThemeGenerator(opts: BuildLLMThemeGeneratorOptions): WeeklyPlanThemeGenerator {
  const { llm } = opts;
  return async (input) => {
    const result = await generateWeeklyTheme({
      llm,
      concepts: input.concepts.map((c) => {
        const tags = c.tags;
        return tags !== undefined ? { slug: c.slug, name: c.name, tags } : { slug: c.slug, name: c.name };
      }),
      target_role: input.target_role ?? null,
    });
    if (result === null) return null;
    return { theme: result.theme };
  };
}

// Reads `LEARNPRO_WEEKLY_THEME_LLM` and returns a WeeklyPlanThemeGenerator only when the
// flag is enabled (default on; set to "0" / "false" / "off" to disable). Defense in depth:
// when no LLM is wired (no API key), the env flag effectively no-ops because the caller
// won't supply this generator.
export function buildWeeklyThemeGeneratorFromEnv(opts: {
  llm: LLMProvider;
  env: NodeJS.ProcessEnv;
}): WeeklyPlanThemeGenerator | undefined {
  const raw = (opts.env["LEARNPRO_WEEKLY_THEME_LLM"] ?? "1").toLowerCase().trim();
  const disabled = raw === "0" || raw === "false" || raw === "off" || raw === "no";
  if (disabled) return undefined;
  return buildLLMThemeGenerator({ llm: opts.llm });
}

// === DB-backed deps adapter (production wiring) ===

export interface BuildDbWeeklyPlanDepsOptions {
  db: import("@learnpro/db").LearnProDb;
}

export function buildDbWeeklyPlanDeps(opts: BuildDbWeeklyPlanDepsOptions): WeeklyPlanDeps {
  const { db } = opts;
  return {
    async getActiveTrackSlug({ user_id }) {
      const { getActiveTrackSlugs } = await import("@learnpro/db");
      const slugs = await getActiveTrackSlugs(db, user_id);
      return slugs[0] ?? null;
    },
    async getConceptGraph({ track_slug }) {
      return loadConceptGraphFromDb(db, track_slug);
    },
    async getRecentEpisodes({ user_id, track_slug }) {
      return loadRecentEpisodesFromDb(db, user_id, track_slug);
    },
    async getDueReviews({ user_id, now }) {
      const { getDueConcepts } = await import("@learnpro/db");
      const rows = await getDueConcepts(db, user_id, now);
      return rows.map((r) => ({ concept_slug: r.concept_id }));
    },
    async getTargetRole({ user_id }) {
      const { getProfileTargetRole } = await import("@learnpro/db");
      const row = await getProfileTargetRole(db, user_id);
      return row?.target_role ?? null;
    },
    async getPreviousMarkerAt({ user_id }) {
      const { getLatestActivePlan } = await import("@learnpro/db");
      const plan = await getLatestActivePlan(db, user_id, new Date());
      return plan?.created_at ?? null;
    },
    async countTodaysEpisodes({ user_id, now }) {
      return countEpisodesSince(db, user_id, startOfUtcDay(now));
    },
  };
}

// Loads the concept graph for a single track from the seeded `concepts` + `prerequisites` rows.
// Filters concepts by `track_slugs` jsonb membership (the seeder writes the track-slug array on
// each row from the YAML). Drops edges where either endpoint isn't in the per-track concept set.
async function loadConceptGraphFromDb(
  db: import("@learnpro/db").LearnProDb,
  trackSlug: string,
): Promise<WeeklyPlanConceptGraph> {
  const { concepts, prerequisites } = await import("@learnpro/db");
  const rows = await db
    .select({
      id: concepts.id,
      slug: concepts.slug,
      name: concepts.name,
      tags: concepts.tags,
      track_slugs: concepts.track_slugs,
    })
    .from(concepts);

  const conceptList: Array<{
    slug: string;
    name: string;
    track_slugs: ReadonlyArray<string>;
    tags: ReadonlyArray<string>;
  }> = [];
  const idToSlug = new Map<string, string>();
  for (const r of rows) {
    const trackSlugs = parseStringArray(r.track_slugs);
    if (!trackSlugs.includes(trackSlug)) continue;
    const tags = parseStringArray(r.tags);
    conceptList.push({
      slug: r.slug,
      name: r.name,
      track_slugs: trackSlugs,
      tags,
    });
    idToSlug.set(r.id, r.slug);
  }

  const edgeRows = await db
    .select({
      from_concept_id: prerequisites.from_concept_id,
      to_concept_id: prerequisites.to_concept_id,
    })
    .from(prerequisites);

  const edges: Array<{ from: string; to: string }> = [];
  for (const e of edgeRows) {
    const from = idToSlug.get(e.from_concept_id);
    const to = idToSlug.get(e.to_concept_id);
    if (from && to) edges.push({ from, to });
  }
  return { concepts: conceptList, edges };
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const v of value) {
    if (typeof v === "string") out.push(v);
  }
  return out;
}

// Loads the user's recent episodes scoped to a track, newest-first. Joins to `problems` by
// problem_id, then looks up the per-problem `concept_tags` from the YAML seed bank (concept tags
// live on the YAML def, not the DB row — same pattern as the agent's drizzle-deps adapter).
async function loadRecentEpisodesFromDb(
  db: import("@learnpro/db").LearnProDb,
  user_id: string,
  trackSlug: string,
): Promise<ReadonlyArray<WeeklyPlanRecentEpisode>> {
  const { episodes, problems, tracks } = await import("@learnpro/db");
  const { eq, and, desc } = await import("drizzle-orm");
  const rows = await db
    .select({
      final_outcome: episodes.final_outcome,
      started_at: episodes.started_at,
      problem_slug: problems.slug,
    })
    .from(episodes)
    .innerJoin(problems, eq(episodes.problem_id, problems.id))
    .innerJoin(tracks, eq(problems.track_id, tracks.id))
    .where(and(eq(episodes.user_id, user_id), eq(tracks.slug, trackSlug)))
    .orderBy(desc(episodes.started_at))
    .limit(30);

  const { loadProblems } = await import("@learnpro/problems");
  const catalogConceptTags = new Map<string, string[]>();
  for (const def of loadProblems()) {
    catalogConceptTags.set(def.slug, def.concept_tags ?? []);
  }

  return rows.map((r) => ({
    concept_slugs: catalogConceptTags.get(r.problem_slug) ?? [],
    final_outcome: normalizeOutcome(r.final_outcome),
    started_at: r.started_at,
  }));
}

// The DB enum values (`passed` / `passed_with_hints` / `failed` / `abandoned` / `revealed`)
// flatten to the weekly-plan's coarser `pass | fail | abandoned | null`. `revealed` counts as a
// fail for pace/frontier purposes (the user looked at the answer; not yet mastered).
function normalizeOutcome(o: unknown): "pass" | "fail" | "abandoned" | null {
  if (o === "passed" || o === "passed_with_hints") return "pass";
  if (o === "failed" || o === "revealed") return "fail";
  if (o === "abandoned") return "abandoned";
  return null;
}

async function countEpisodesSince(
  db: import("@learnpro/db").LearnProDb,
  user_id: string,
  since: Date,
): Promise<number> {
  const { episodes } = await import("@learnpro/db");
  const { and, eq, gte } = await import("drizzle-orm");
  const rows = await db
    .select({ id: episodes.id })
    .from(episodes)
    .where(and(eq(episodes.user_id, user_id), gte(episodes.started_at, since)));
  return rows.length;
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
