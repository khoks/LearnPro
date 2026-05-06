import type { FastifyInstance } from "fastify";
import {
  buildTodayPlan,
  TodayPlanSchema,
  type TodayPlan,
  type TodayPlanDeps,
} from "@learnpro/agent";
import type { SessionPlanFactory } from "./session-plan.js";
import type { SessionResolver } from "./session.js";

// STORY-046 — today's-plan routes:
//   GET  /v1/today-plan          — composed read of today's plan (review queue + session plan)
//   POST /v1/today-plan/replan   — re-plan request; AC #5 dampening may suppress the regenerate
//
// The composer lives in @learnpro/agent (`buildTodayPlan`). It composes from existing data
// (session_plans + concept_reviews + episodes count) — no new schema. Re-plan dampening is also
// in the composer; this route just acts on the dampening signal:
//   - dampened → return existing plan + flag
//   - not dampened → call sessionPlanFactory.generateAndPersist + return fresh plan
//
// Weekly plans are NOT composed here. Per STORY-046 spec — weekly themed plans need a populated
// knowledge graph (STORY-032). Deferred to STORY-046b. The /plan UI surfaces a stub; this route's
// shape reflects current capability (today only).

export interface TodayPlanRouteOptions {
  todayPlanDeps: TodayPlanDeps;
  // Used by the replan path to actually regenerate the session plan when dampening doesn't
  // suppress it. Reuses STORY-015's factory so we don't double up on plan-agent wiring.
  sessionPlanFactory: SessionPlanFactory;
  sessionResolver: SessionResolver;
  // Default time budget for re-generated session plans. Defaults to STORY-015's 25 min.
  default_time_budget_min?: number;
}

const DEFAULT_TIME_BUDGET_MIN = 25;

export function registerTodayPlanRoutes(
  app: FastifyInstance,
  opts: TodayPlanRouteOptions,
): void {
  const default_budget = opts.default_time_budget_min ?? DEFAULT_TIME_BUDGET_MIN;

  app.get("/v1/today-plan", async (req, reply) => {
    const session = await opts.sessionResolver(req);
    if (!session) return reply.code(401).send({ error: "unauthorized" });
    const now = new Date();
    const plan = await buildTodayPlan({
      user_id: session.user_id,
      now,
      deps: opts.todayPlanDeps,
    });
    return reply.code(200).send({ today_plan: serialize(plan) });
  });

  app.post("/v1/today-plan/replan", async (req, reply) => {
    const session = await opts.sessionResolver(req);
    if (!session) return reply.code(401).send({ error: "unauthorized" });
    const now = new Date();
    const dampenCheck = await buildTodayPlan({
      user_id: session.user_id,
      now,
      regenerate: true,
      deps: opts.todayPlanDeps,
    });

    if (dampenCheck.dampening.suppressed_replan_reason !== undefined) {
      return reply.code(200).send({
        today_plan: serialize(dampenCheck),
        dampened: true,
        reason: dampenCheck.dampening.suppressed_replan_reason,
      });
    }

    // Not dampened — regenerate the session-plan portion and re-compose. We deliberately don't
    // touch the FSRS review queue here; FSRS is its own scheduler and "re-planning" doesn't
    // mean "force-due everything that's already known".
    try {
      // Mark the existing plan expired so the next generate doesn't short-circuit on the
      // idempotency guard in `generateAndPersist`. The factory's loadLatest is the
      // short-circuit point; we set the latest plan to null by leveraging the existing
      // factory's contract (the factory itself owns the existing-plan check internally for
      // POST /v1/session-plan, but for re-plan we want a fresh generation regardless).
      //
      // Implementation: generateAndPersist always runs the planner + persists a new plan.
      // STORY-015's generateAndPersist does NOT check loadLatest itself — that check is the
      // route's job. Here we explicitly want re-generation.
      await opts.sessionPlanFactory.generateAndPersist({
        user_id: session.user_id,
        org_id: session.org_id,
        time_budget_min: default_budget,
      });
    } catch (err) {
      req.log.warn({ err }, "today-plan replan generation failed — surfacing 503");
      return reply.code(503).send({
        error: "today_plan_unavailable",
        message: "Re-planner is briefly unavailable. Try again in a moment.",
      });
    }

    const next = await buildTodayPlan({
      user_id: session.user_id,
      now,
      deps: opts.todayPlanDeps,
    });
    return reply.code(200).send({
      today_plan: serialize(next),
      dampened: false,
    });
  });
}

function serialize(plan: TodayPlan): TodayPlan {
  // Light passthrough: TodayPlan is already JSON-friendly (date is a string, due/items use
  // strings). Validating here gives us a runtime safety net that the route never emits a shape
  // the UI doesn't expect.
  return TodayPlanSchema.parse(plan);
}

// Helper used by apps/api/src/index.ts to build the TodayPlanDeps from a Drizzle DB.
export interface BuildDbTodayPlanDepsOptions {
  db: import("@learnpro/db").LearnProDb;
}

export function buildDbTodayPlanDeps(opts: BuildDbTodayPlanDepsOptions): TodayPlanDeps {
  const { db } = opts;
  return {
    async getLatestActivePlan({ user_id, now }) {
      const { getLatestActivePlan } = await import("@learnpro/db");
      const plan = await getLatestActivePlan(db, user_id, now);
      if (!plan) return null;
      return {
        id: plan.id,
        user_id: plan.user_id,
        created_at: plan.created_at,
        items: plan.items.map((it) => ({
          slug: it.slug,
          objective: it.objective,
          estimated_duration_min: it.estimated_duration_min,
          status: it.status,
        })),
      };
    },
    async getDueConcepts({ user_id, now }) {
      const { getDueConcepts } = await import("@learnpro/db");
      const rows = await getDueConcepts(db, user_id, now);
      return rows.map((r) => ({
        concept_id: r.concept_id,
        state: { due: r.state.due },
      }));
    },
    async countTodaysEpisodes({ user_id, now }) {
      return countEpisodesSince(db, user_id, startOfUtcDay(now));
    },
  };
}

// Counts episodes for a user where started_at >= since. Inlined here (not @learnpro/db) because
// it's the only caller right now and the helper would otherwise be a copy of `countUserEpisodes`
// with one extra predicate.
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
