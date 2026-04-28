import type { StoredInteraction } from "@learnpro/shared";
import { eq } from "drizzle-orm";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type LearnProDb } from "./client.js";
import { DrizzleInteractionStore } from "./interaction-store.js";
import { runMigrations } from "./migrate.js";
import { interactions, organizations, users } from "./schema.js";

const DATABASE_URL = process.env["DATABASE_URL"];

// Integration tests against a real Postgres (Docker Compose).
// Skipped when DATABASE_URL isn't set so `pnpm test` still passes in CI without a DB.
// Run locally with: `DATABASE_URL=postgresql://learnpro:learnpro@localhost:5432/learnpro pnpm --filter @learnpro/db test`
describe.skipIf(!DATABASE_URL)("DrizzleInteractionStore (integration)", () => {
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
      .values({ email: `interaction-test-${Date.now()}@learnpro.local` })
      .returning({ id: users.id });
    const id = inserted[0]?.id;
    if (!id) throw new Error("failed to insert test user");
    testUserId = id;
  });

  afterAll(async () => {
    if (db) {
      await db.delete(interactions).where(eq(interactions.user_id, testUserId));
      await db.delete(users).where(eq(users.id, testUserId));
    }
    await pool?.end();
  });

  beforeEach(async () => {
    await db.delete(interactions).where(eq(interactions.user_id, testUserId));
  });

  it("inserts a single batch row with full mapping (type / payload / t / user_id / org_id)", async () => {
    const store = new DrizzleInteractionStore({ db });
    const t = new Date();
    await store.recordBatch([
      {
        type: "cursor_focus",
        payload: { line_start: 4, line_end: 7, duration_ms: 1200 },
        t,
        user_id: testUserId,
        episode_id: null,
      },
    ]);
    const rows = await db.select().from(interactions).where(eq(interactions.user_id, testUserId));
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.type).toBe("cursor_focus");
    expect(row.payload).toEqual({ line_start: 4, line_end: 7, duration_ms: 1200 });
    expect(row.org_id).toBe("self");
    expect(row.t.toISOString()).toBe(t.toISOString());
  });

  it("bulk-inserts multiple events in a single round-trip", async () => {
    const store = new DrizzleInteractionStore({ db });
    const t = new Date();
    const batch: StoredInteraction[] = [
      {
        type: "edit",
        payload: {
          from: "x = 1",
          to: "x = 2",
          range: { start_line: 1, start_col: 0, end_line: 1, end_col: 5 },
        },
        t,
        user_id: testUserId,
        episode_id: null,
      },
      {
        type: "submit",
        payload: { passed: true },
        t,
        user_id: testUserId,
        episode_id: null,
      },
      {
        type: "hint_request",
        payload: { rung: 2 },
        t,
        user_id: testUserId,
        episode_id: null,
      },
    ];
    await store.recordBatch(batch);
    const rows = await db.select().from(interactions).where(eq(interactions.user_id, testUserId));
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.type).sort()).toEqual(["edit", "hint_request", "submit"]);
  });

  it("recordBatch([]) is a no-op (does not hit the DB)", async () => {
    const store = new DrizzleInteractionStore({ db });
    await store.recordBatch([]);
    const rows = await db.select().from(interactions).where(eq(interactions.user_id, testUserId));
    expect(rows).toHaveLength(0);
  });

  it("supports anonymous events (user_id null) — playground writes before auth lands", async () => {
    const store = new DrizzleInteractionStore({ db });
    await store.recordBatch([
      {
        type: "run",
        payload: { language: "python", exit_code: 0 },
        t: new Date(),
        user_id: null,
        episode_id: null,
      },
    ]);
    const rows = await db.select().from(interactions).where(eq(interactions.user_id, testUserId));
    expect(rows).toHaveLength(0); // not attributed to our test user
    const anon = await db.select().from(interactions);
    expect(anon.some((r) => r.user_id === null && r.type === "run")).toBe(true);
    // tidy
    await db.delete(interactions).where(eq(interactions.type, "run"));
  });

  it("custom org_id from constructor is stamped on every row", async () => {
    await db
      .insert(organizations)
      .values({ id: "test-org-055", name: "Test Org 055" })
      .onConflictDoNothing();
    try {
      const store = new DrizzleInteractionStore({ db, org_id: "test-org-055" });
      await store.recordBatch([
        {
          type: "submit",
          payload: { passed: false },
          t: new Date(),
          user_id: testUserId,
          episode_id: null,
        },
      ]);
      const rows = await db.select().from(interactions).where(eq(interactions.user_id, testUserId));
      expect(rows).toHaveLength(1);
      expect(rows[0]!.org_id).toBe("test-org-055");
    } finally {
      await db.delete(interactions).where(eq(interactions.user_id, testUserId));
      await db.delete(organizations).where(eq(organizations.id, "test-org-055"));
    }
  });
});
