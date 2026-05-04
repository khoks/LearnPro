import { eq } from "drizzle-orm";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type LearnProDb } from "./client.js";
import { runMigrations } from "./migrate.js";
import { organizations, session_plans, users } from "./schema.js";
import {
  createPlan,
  getLatestActivePlan,
  markItemCompleted,
  rollOverPending,
} from "./session-plan.js";

const DATABASE_URL = process.env["DATABASE_URL"];

// All `session-plan` helpers run against a real Postgres (Docker Compose). Skipped when
// DATABASE_URL is unset so `pnpm test` stays clean in CI without a DB.
// Run locally with: `DATABASE_URL=postgresql://learnpro:learnpro@localhost:5432/learnpro pnpm --filter @learnpro/db test`
describe.skipIf(!DATABASE_URL)("session-plan (integration)", () => {
  let db: LearnProDb;
  let pool: Pool;
  let testUserId: string;

  beforeAll(async () => {
    const created = createDb({ connectionString: DATABASE_URL ?? "" });
    db = created.db;
    pool = created.pool;
    await runMigrations();
    await db
      .insert(organizations)
      .values({ id: "self", name: "Self-hosted" })
      .onConflictDoNothing();

    const inserted = await db
      .insert(users)
      .values({ email: `session-plan-test-${Date.now()}@learnpro.local` })
      .returning({ id: users.id });
    testUserId = inserted[0]!.id;
  });

  afterAll(async () => {
    if (db) {
      await db.delete(session_plans).where(eq(session_plans.user_id, testUserId));
      await db.delete(users).where(eq(users.id, testUserId));
    }
    await pool?.end();
  });

  beforeEach(async () => {
    await db.delete(session_plans).where(eq(session_plans.user_id, testUserId));
  });

  describe("getLatestActivePlan", () => {
    it("returns null when there is no plan for the user", async () => {
      const plan = await getLatestActivePlan(db, testUserId);
      expect(plan).toBeNull();
    });

    it("returns the latest unexpired plan", async () => {
      const created = await createPlan(db, {
        user_id: testUserId,
        time_budget_min: 25,
        items: [
          { slug: "warmup", objective: "warm up", estimated_duration_min: 8 },
          { slug: "drill", objective: "practice", estimated_duration_min: 10 },
          { slug: "stretch", objective: "stretch", estimated_duration_min: 5 },
        ],
      });
      const fetched = await getLatestActivePlan(db, testUserId);
      expect(fetched).not.toBeNull();
      expect(fetched?.id).toBe(created.id);
      expect(fetched?.items).toHaveLength(3);
      expect(fetched?.items[0]?.status).toBe("pending");
    });

    it("ignores expired plans", async () => {
      const past = new Date(Date.now() - 60_000);
      await createPlan(db, {
        user_id: testUserId,
        time_budget_min: 25,
        items: [
          { slug: "a", objective: "A", estimated_duration_min: 5 },
          { slug: "b", objective: "B", estimated_duration_min: 5 },
          { slug: "c", objective: "C", estimated_duration_min: 5 },
        ],
        ttl_hours: 0,
        now: past,
      });
      expect(await getLatestActivePlan(db, testUserId)).toBeNull();
    });

    it("returns the most recently created among multiple active plans", async () => {
      const earlier = await createPlan(db, {
        user_id: testUserId,
        time_budget_min: 25,
        items: [
          { slug: "old-1", objective: "old", estimated_duration_min: 5 },
          { slug: "old-2", objective: "old", estimated_duration_min: 5 },
          { slug: "old-3", objective: "old", estimated_duration_min: 5 },
        ],
        now: new Date(Date.now() - 10_000),
      });
      const later = await createPlan(db, {
        user_id: testUserId,
        time_budget_min: 25,
        items: [
          { slug: "new-1", objective: "new", estimated_duration_min: 5 },
          { slug: "new-2", objective: "new", estimated_duration_min: 5 },
          { slug: "new-3", objective: "new", estimated_duration_min: 5 },
        ],
      });
      const fetched = await getLatestActivePlan(db, testUserId);
      expect(fetched?.id).toBe(later.id);
      expect(fetched?.id).not.toBe(earlier.id);
    });
  });

  describe("createPlan", () => {
    it("inserts a row with status=pending across all items", async () => {
      const plan = await createPlan(db, {
        user_id: testUserId,
        time_budget_min: 25,
        items: [
          { slug: "warmup", objective: "warm up", estimated_duration_min: 8 },
          { slug: "drill", objective: "practice", estimated_duration_min: 10 },
          { slug: "stretch", objective: "stretch", estimated_duration_min: 5 },
        ],
      });
      expect(plan.items.every((i) => i.status === "pending")).toBe(true);
      expect(plan.expires_at.getTime()).toBeGreaterThan(plan.created_at.getTime());
    });

    it("expires 24h after creation by default", async () => {
      const now = new Date();
      const plan = await createPlan(db, {
        user_id: testUserId,
        time_budget_min: 25,
        items: [
          { slug: "a", objective: "A", estimated_duration_min: 5 },
          { slug: "b", objective: "B", estimated_duration_min: 5 },
          { slug: "c", objective: "C", estimated_duration_min: 5 },
        ],
        now,
      });
      const diffHours = (plan.expires_at.getTime() - plan.created_at.getTime()) / (60 * 60 * 1000);
      expect(diffHours).toBeCloseTo(24, 0);
    });
  });

  describe("markItemCompleted", () => {
    it("marks the matching slug completed + stamps episode_id + completed_at", async () => {
      const plan = await createPlan(db, {
        user_id: testUserId,
        time_budget_min: 25,
        items: [
          { slug: "warmup", objective: "warm up", estimated_duration_min: 8 },
          { slug: "drill", objective: "practice", estimated_duration_min: 10 },
          { slug: "stretch", objective: "stretch", estimated_duration_min: 5 },
        ],
      });
      const ep_id = "11111111-1111-4111-8111-111111111111";
      const r = await markItemCompleted(db, plan.id, "drill", ep_id);
      expect(r.updated).toBe(true);
      const drill = r.plan?.items.find((i) => i.slug === "drill");
      expect(drill?.status).toBe("completed");
      expect(drill?.episode_id).toBe(ep_id);
      expect(drill?.completed_at).toBeDefined();
    });

    it("is idempotent: re-marking a completed item is a no-op (updated=false)", async () => {
      const plan = await createPlan(db, {
        user_id: testUserId,
        time_budget_min: 25,
        items: [
          { slug: "a", objective: "A", estimated_duration_min: 5 },
          { slug: "b", objective: "B", estimated_duration_min: 5 },
          { slug: "c", objective: "C", estimated_duration_min: 5 },
        ],
      });
      const ep_id = "22222222-2222-4222-8222-222222222222";
      const first = await markItemCompleted(db, plan.id, "a", ep_id);
      expect(first.updated).toBe(true);
      const second = await markItemCompleted(db, plan.id, "a", ep_id);
      expect(second.updated).toBe(false);
      expect(second.plan?.items.find((i) => i.slug === "a")?.status).toBe("completed");
    });

    it("returns updated=false when slug doesn't match any item", async () => {
      const plan = await createPlan(db, {
        user_id: testUserId,
        time_budget_min: 25,
        items: [
          { slug: "a", objective: "A", estimated_duration_min: 5 },
          { slug: "b", objective: "B", estimated_duration_min: 5 },
          { slug: "c", objective: "C", estimated_duration_min: 5 },
        ],
      });
      const r = await markItemCompleted(
        db,
        plan.id,
        "missing-slug",
        "33333333-3333-4333-8333-333333333333",
      );
      expect(r.updated).toBe(false);
    });

    it("returns updated=false + plan=null when plan_id doesn't exist", async () => {
      const r = await markItemCompleted(
        db,
        "99999999-9999-4999-8999-999999999999",
        "any",
        "44444444-4444-4444-8444-444444444444",
      );
      expect(r.updated).toBe(false);
      expect(r.plan).toBeNull();
    });
  });

  describe("rollOverPending", () => {
    it("returns pending items + sets expires_at to now (so getLatestActivePlan ignores it)", async () => {
      const plan = await createPlan(db, {
        user_id: testUserId,
        time_budget_min: 25,
        items: [
          { slug: "a", objective: "A", estimated_duration_min: 5 },
          { slug: "b", objective: "B", estimated_duration_min: 5 },
          { slug: "c", objective: "C", estimated_duration_min: 5 },
        ],
      });
      // Mark one done so rollOver returns just the remaining 2.
      await markItemCompleted(db, plan.id, "a", "55555555-5555-4555-8555-555555555555");
      const { pending } = await rollOverPending(db, plan.id);
      expect(pending).toHaveLength(2);
      expect(pending.map((p) => p.slug).sort()).toEqual(["b", "c"]);
      expect(await getLatestActivePlan(db, testUserId)).toBeNull();
    });

    it("returns empty pending list when the plan is fully completed", async () => {
      const plan = await createPlan(db, {
        user_id: testUserId,
        time_budget_min: 25,
        items: [
          { slug: "a", objective: "A", estimated_duration_min: 5 },
          { slug: "b", objective: "B", estimated_duration_min: 5 },
          { slug: "c", objective: "C", estimated_duration_min: 5 },
        ],
      });
      const ep_id = "66666666-6666-4666-8666-666666666666";
      await markItemCompleted(db, plan.id, "a", ep_id);
      await markItemCompleted(db, plan.id, "b", ep_id);
      await markItemCompleted(db, plan.id, "c", ep_id);
      const { pending } = await rollOverPending(db, plan.id);
      expect(pending).toEqual([]);
    });

    it("returns empty when plan_id doesn't exist", async () => {
      const { pending } = await rollOverPending(db, "77777777-7777-4777-8777-777777777777");
      expect(pending).toEqual([]);
    });
  });
});
