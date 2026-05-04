import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { createPlan, getLatestActivePlan, markItemCompleted, type SessionPlan } from "@learnpro/db";
import type { SessionResolver } from "./session.js";

// STORY-015 — three auth-gated endpoints for the session plan:
//   GET  /v1/session-plan                                — latest active plan or null
//   POST /v1/session-plan                                — generate via planSessionFactory then persist (idempotent within window)
//   POST /v1/session-plan/items/:slug/complete           — mark slug completed
//
// The agent + DB sit behind a `sessionPlanFactory` so tests can pass a fake without booting
// either Postgres or the LLM.

export interface SessionPlanCreateInput {
  user_id: string;
  org_id: string;
  time_budget_min: number;
}

export interface SessionPlanCreateResult {
  items: ReadonlyArray<{
    slug: string;
    objective: string;
    estimated_duration_min: number;
  }>;
  fallback: boolean;
  time_budget_min: number;
}

// The factory generates plan items via the LLM and persists them. Returning the persisted plan
// keeps the route handler thin (just resolve session → call factory → 200).
export interface SessionPlanFactory {
  // Generate items, persist to DB, return the persisted plan. The factory owns getLatestActivePlan
  // checks INTERNALLY so callers don't double-generate when an active plan exists.
  generateAndPersist(input: SessionPlanCreateInput): Promise<{
    plan: SessionPlan;
    fallback: boolean;
  }>;
  // Used by GET /v1/session-plan and POST handlers to read the latest active plan.
  loadLatest(input: { user_id: string }): Promise<SessionPlan | null>;
  // Used by POST /v1/session-plan/items/:slug/complete.
  markCompleted(input: {
    plan_id: string;
    slug: string;
    episode_id: string;
  }): Promise<{ updated: boolean; plan: SessionPlan | null }>;
}

const CompleteItemBodySchema = z.object({
  episode_id: z.string().uuid(),
});

const SlugParamSchema = z
  .string()
  .min(1)
  .max(60)
  .regex(/^[a-z0-9-]+$/);

export interface RegisterSessionPlanRoutesOptions {
  factory: SessionPlanFactory;
  sessionResolver: SessionResolver;
  // Default time budget when the user's profile doesn't set one. STORY-015 spec says 25 min.
  default_time_budget_min?: number;
}

export const DEFAULT_SESSION_PLAN_BUDGET_MIN = 25;

export function registerSessionPlanRoutes(
  app: FastifyInstance,
  opts: RegisterSessionPlanRoutesOptions,
): void {
  const default_budget = opts.default_time_budget_min ?? DEFAULT_SESSION_PLAN_BUDGET_MIN;

  app.get("/v1/session-plan", async (req, reply) => {
    const session = await opts.sessionResolver(req);
    if (!session) return reply.code(401).send({ error: "unauthorized" });
    const plan = await opts.factory.loadLatest({ user_id: session.user_id });
    return reply.code(200).send({ plan: plan ? serializePlan(plan) : null });
  });

  app.post("/v1/session-plan", async (req, reply) => {
    const session = await opts.sessionResolver(req);
    if (!session) return reply.code(401).send({ error: "unauthorized" });

    // Idempotency: if there is already an active plan for this user, return it instead of
    // re-generating. The /session UI fires this on every mount; without the short-circuit we'd
    // burn an LLM call per refresh.
    const existing = await opts.factory.loadLatest({ user_id: session.user_id });
    if (existing) {
      return reply.code(200).send({ plan: serializePlan(existing), fallback: false });
    }

    try {
      const { plan, fallback } = await opts.factory.generateAndPersist({
        user_id: session.user_id,
        org_id: session.org_id,
        time_budget_min: default_budget,
      });
      return reply.code(201).send({ plan: serializePlan(plan), fallback });
    } catch (err) {
      req.log.warn({ err }, "session-plan generation failed — surfacing 503");
      return reply.code(503).send({
        error: "session_plan_unavailable",
        message: "The plan agent is briefly unavailable. Try again in a moment.",
      });
    }
  });

  app.post<{
    Params: { slug: string };
    Body: { episode_id: string };
  }>("/v1/session-plan/items/:slug/complete", async (req, reply) => {
    const session = await opts.sessionResolver(req);
    if (!session) return reply.code(401).send({ error: "unauthorized" });

    const slugParse = SlugParamSchema.safeParse(req.params.slug);
    if (!slugParse.success) {
      return reply.code(400).send({ error: "invalid_request", message: "slug must be kebab-case" });
    }

    const bodyParse = CompleteItemBodySchema.safeParse(req.body);
    if (!bodyParse.success) {
      return reply.code(400).send({ error: "invalid_request", issues: bodyParse.error.issues });
    }

    const existing = await opts.factory.loadLatest({ user_id: session.user_id });
    if (!existing) {
      return reply.code(404).send({ error: "no_active_plan" });
    }

    const result = await opts.factory.markCompleted({
      plan_id: existing.id,
      slug: slugParse.data,
      episode_id: bodyParse.data.episode_id,
    });

    return reply.code(200).send({
      updated: result.updated,
      plan: result.plan ? serializePlan(result.plan) : null,
    });
  });
}

function serializePlan(plan: SessionPlan) {
  return {
    id: plan.id,
    user_id: plan.user_id,
    created_at: plan.created_at.toISOString(),
    expires_at: plan.expires_at.toISOString(),
    time_budget_min: plan.time_budget_min,
    items: plan.items,
  };
}

// Default Drizzle/LLM-backed factory builder — wires the planSession agent tool together with the
// session_plans DB helpers. Lives here so both the production wiring (apps/api/src/index.ts) and
// the test fakes share the same surface.
export interface BuildDrizzleSessionPlanFactoryOptions {
  // Caller supplies a function that runs the planSession tool and returns the items. This keeps
  // session-plan.ts free of any direct dependency on @learnpro/agent — apps/api wires the
  // adapter once at boot.
  generate(input: SessionPlanCreateInput): Promise<{
    items: ReadonlyArray<{ slug: string; objective: string; estimated_duration_min: number }>;
    fallback: boolean;
  }>;
  loadLatest(input: { user_id: string }): Promise<SessionPlan | null>;
  persist(input: {
    user_id: string;
    org_id: string;
    time_budget_min: number;
    items: ReadonlyArray<{ slug: string; objective: string; estimated_duration_min: number }>;
  }): Promise<SessionPlan>;
  markCompleted(input: {
    plan_id: string;
    slug: string;
    episode_id: string;
  }): Promise<{ updated: boolean; plan: SessionPlan | null }>;
}

export function buildSessionPlanFactory(
  opts: BuildDrizzleSessionPlanFactoryOptions,
): SessionPlanFactory {
  return {
    async loadLatest(input) {
      return opts.loadLatest(input);
    },
    async generateAndPersist(input) {
      const { items, fallback } = await opts.generate(input);
      const plan = await opts.persist({
        user_id: input.user_id,
        org_id: input.org_id,
        time_budget_min: input.time_budget_min,
        items,
      });
      return { plan, fallback };
    },
    async markCompleted(input) {
      return opts.markCompleted(input);
    },
  };
}

// Helper for the production wiring — composes the DB-backed loader / persister / completer from
// the @learnpro/db helpers. Exported so apps/api/src/index.ts can pass it the LLM-backed
// `generate` adapter and get a full SessionPlanFactory.
export interface BuildDbSessionPlanAdaptersOptions {
  // The drizzle DB. Typed loose to avoid a type-only import cycle through apps/api.
  db: import("@learnpro/db").LearnProDb;
}

export function buildDbSessionPlanAdapters(opts: BuildDbSessionPlanAdaptersOptions): {
  loadLatest: BuildDrizzleSessionPlanFactoryOptions["loadLatest"];
  persist: BuildDrizzleSessionPlanFactoryOptions["persist"];
  markCompleted: BuildDrizzleSessionPlanFactoryOptions["markCompleted"];
} {
  return {
    async loadLatest(input) {
      return getLatestActivePlan(opts.db, input.user_id);
    },
    async persist(input) {
      return createPlan(opts.db, {
        user_id: input.user_id,
        org_id: input.org_id,
        time_budget_min: input.time_budget_min,
        items: input.items,
      });
    },
    async markCompleted(input) {
      return markItemCompleted(opts.db, input.plan_id, input.slug, input.episode_id);
    },
  };
}
