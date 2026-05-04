import { and, desc, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";
import type { LearnProDb } from "./client.js";
import { SELF_HOSTED_ORG_ID, session_plans } from "./schema.js";

// STORY-015 — DB-side glue for the session-plan agent. The pure planner lives in @learnpro/agent;
// these helpers persist + roll over plans. The jsonb `items` column is round-tripped through Zod
// so reads from the DB are validated before they leave the boundary.

export const SessionPlanItemStatusSchema = z.enum(["pending", "completed"]);
export type SessionPlanItemStatus = z.infer<typeof SessionPlanItemStatusSchema>;

export const SessionPlanItemSchema = z.object({
  slug: z.string().min(1),
  objective: z.string().min(1),
  estimated_duration_min: z.number().int().positive(),
  status: SessionPlanItemStatusSchema,
  completed_at: z.string().datetime().optional(),
  episode_id: z.string().uuid().optional(),
});
export type SessionPlanItem = z.infer<typeof SessionPlanItemSchema>;

export const SessionPlanItemsSchema = z.array(SessionPlanItemSchema);

export interface SessionPlan {
  id: string;
  user_id: string;
  org_id: string;
  created_at: Date;
  expires_at: Date;
  time_budget_min: number;
  items: SessionPlanItem[];
}

export const DEFAULT_PLAN_TTL_HOURS = 24;

// "Active" = not expired + most recent. Returns null when there is no row OR the latest row's
// expires_at is in the past relative to `now`. The caller is expected to regenerate.
export async function getLatestActivePlan(
  db: LearnProDb,
  user_id: string,
  now: Date = new Date(),
): Promise<SessionPlan | null> {
  const rows = await db
    .select({
      id: session_plans.id,
      user_id: session_plans.user_id,
      org_id: session_plans.org_id,
      created_at: session_plans.created_at,
      expires_at: session_plans.expires_at,
      time_budget_min: session_plans.time_budget_min,
      items: session_plans.items,
    })
    .from(session_plans)
    .where(and(eq(session_plans.user_id, user_id), gt(session_plans.expires_at, now)))
    .orderBy(desc(session_plans.created_at))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const items = SessionPlanItemsSchema.parse(row.items);
  return {
    id: row.id,
    user_id: row.user_id,
    org_id: row.org_id,
    created_at: row.created_at,
    expires_at: row.expires_at,
    time_budget_min: row.time_budget_min,
    items,
  };
}

export interface CreatePlanInput {
  user_id: string;
  org_id?: string;
  time_budget_min: number;
  items: ReadonlyArray<Omit<SessionPlanItem, "status">>;
  ttl_hours?: number;
  now?: Date;
}

// New `pending` items are inserted with `status: "pending"`. Callers can pass already-rolled-over
// items by including their full SessionPlanItem shape — `status` is normalized to "pending" here
// so a fresh plan never carries over completed status from yesterday.
export async function createPlan(db: LearnProDb, input: CreatePlanInput): Promise<SessionPlan> {
  const now = input.now ?? new Date();
  const ttl = input.ttl_hours ?? DEFAULT_PLAN_TTL_HOURS;
  const expires_at = new Date(now.getTime() + ttl * 60 * 60 * 1000);
  const items: SessionPlanItem[] = input.items.map((it) => ({
    slug: it.slug,
    objective: it.objective,
    estimated_duration_min: it.estimated_duration_min,
    status: "pending",
  }));
  const inserted = await db
    .insert(session_plans)
    .values({
      org_id: input.org_id ?? SELF_HOSTED_ORG_ID,
      user_id: input.user_id,
      time_budget_min: input.time_budget_min,
      items,
      expires_at,
      created_at: now,
    })
    .returning({
      id: session_plans.id,
      created_at: session_plans.created_at,
      expires_at: session_plans.expires_at,
    });
  const row = inserted[0];
  if (!row) throw new Error("session_plans insert returned no row");
  return {
    id: row.id,
    user_id: input.user_id,
    org_id: input.org_id ?? SELF_HOSTED_ORG_ID,
    created_at: row.created_at,
    expires_at: row.expires_at,
    time_budget_min: input.time_budget_min,
    items,
  };
}

// Idempotent: if the slug is already completed (status === "completed"), the helper returns the
// existing plan without re-marking. Otherwise it sets the matching item to completed +
// stamps completed_at + episode_id, then writes back the whole jsonb array.
export async function markItemCompleted(
  db: LearnProDb,
  plan_id: string,
  slug: string,
  episode_id: string,
  completed_at: Date = new Date(),
): Promise<{ updated: boolean; plan: SessionPlan | null }> {
  const rows = await db
    .select({
      id: session_plans.id,
      user_id: session_plans.user_id,
      org_id: session_plans.org_id,
      created_at: session_plans.created_at,
      expires_at: session_plans.expires_at,
      time_budget_min: session_plans.time_budget_min,
      items: session_plans.items,
    })
    .from(session_plans)
    .where(eq(session_plans.id, plan_id))
    .limit(1);
  const row = rows[0];
  if (!row) return { updated: false, plan: null };
  const items = SessionPlanItemsSchema.parse(row.items);
  const idx = items.findIndex((it) => it.slug === slug);
  if (idx < 0) {
    return {
      updated: false,
      plan: {
        id: row.id,
        user_id: row.user_id,
        org_id: row.org_id,
        created_at: row.created_at,
        expires_at: row.expires_at,
        time_budget_min: row.time_budget_min,
        items,
      },
    };
  }
  const target = items[idx]!;
  if (target.status === "completed") {
    return {
      updated: false,
      plan: {
        id: row.id,
        user_id: row.user_id,
        org_id: row.org_id,
        created_at: row.created_at,
        expires_at: row.expires_at,
        time_budget_min: row.time_budget_min,
        items,
      },
    };
  }
  const updated: SessionPlanItem = {
    ...target,
    status: "completed",
    completed_at: completed_at.toISOString(),
    episode_id,
  };
  const nextItems = items.slice();
  nextItems[idx] = updated;
  await db.update(session_plans).set({ items: nextItems }).where(eq(session_plans.id, plan_id));
  return {
    updated: true,
    plan: {
      id: row.id,
      user_id: row.user_id,
      org_id: row.org_id,
      created_at: row.created_at,
      expires_at: row.expires_at,
      time_budget_min: row.time_budget_min,
      items: nextItems,
    },
  };
}

// Marks the plan as expired (sets `expires_at = now`) and returns the items still pending so
// the caller can absorb them into a fresh plan. Idempotent: if the plan was already expired,
// the helper still returns the pending items so the caller can re-roll if they want.
export async function rollOverPending(
  db: LearnProDb,
  plan_id: string,
  now: Date = new Date(),
): Promise<{ pending: SessionPlanItem[] }> {
  const rows = await db
    .select({
      items: session_plans.items,
      expires_at: session_plans.expires_at,
    })
    .from(session_plans)
    .where(eq(session_plans.id, plan_id))
    .limit(1);
  const row = rows[0];
  if (!row) return { pending: [] };
  const items = SessionPlanItemsSchema.parse(row.items);
  const pending = items.filter((it) => it.status === "pending");
  if (row.expires_at.getTime() > now.getTime()) {
    await db
      .update(session_plans)
      .set({ expires_at: sql`${now.toISOString()}::timestamptz` })
      .where(eq(session_plans.id, plan_id));
  }
  return { pending };
}
