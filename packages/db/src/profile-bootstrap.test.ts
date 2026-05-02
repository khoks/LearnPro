import { eq } from "drizzle-orm";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type LearnProDb } from "./client.js";
import { runMigrations } from "./migrate.js";
import { bootstrapProfile } from "./profile-bootstrap.js";
import { organizations, profiles, users } from "./schema.js";

const DATABASE_URL = process.env["DATABASE_URL"];

// Integration test for the profile-bootstrap helper used by Auth.js's `events.signIn` (STORY-005).
// Skipped when DATABASE_URL isn't set so `pnpm test` still passes in CI without a DB.
// Run locally with: `DATABASE_URL=postgresql://learnpro:learnpro@localhost:5432/learnpro pnpm --filter @learnpro/db test`
describe.skipIf(!DATABASE_URL)("bootstrapProfile (integration)", () => {
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
      .values({ email: `profile-bootstrap-test-${Date.now()}@learnpro.local` })
      .returning({ id: users.id });
    const id = inserted[0]?.id;
    if (!id) throw new Error("failed to insert test user");
    testUserId = id;
  });

  afterAll(async () => {
    if (db) {
      await db.delete(profiles).where(eq(profiles.user_id, testUserId));
      await db.delete(users).where(eq(users.id, testUserId));
    }
    await pool?.end();
  });

  beforeEach(async () => {
    await db.delete(profiles).where(eq(profiles.user_id, testUserId));
  });

  it("inserts an empty profile row with org_id 'self' on first call", async () => {
    await bootstrapProfile({ db, user_id: testUserId });
    const rows = await db.select().from(profiles).where(eq(profiles.user_id, testUserId));
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.user_id).toBe(testUserId);
    expect(row.org_id).toBe("self");
    expect(row.target_role).toBeNull();
    expect(row.time_budget_min).toBeNull();
    expect(row.primary_goal).toBeNull();
    expect(row.self_assessed_level).toBeNull();
    expect(row.language_comfort).toBeNull();
  });

  it("is idempotent — second call does not overwrite existing profile fields", async () => {
    await bootstrapProfile({ db, user_id: testUserId });
    await db
      .update(profiles)
      .set({ target_role: "swe_intern", time_budget_min: 30 })
      .where(eq(profiles.user_id, testUserId));

    await bootstrapProfile({ db, user_id: testUserId });

    const rows = await db.select().from(profiles).where(eq(profiles.user_id, testUserId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.target_role).toBe("swe_intern");
    expect(rows[0]!.time_budget_min).toBe(30);
  });

  it("respects custom org_id when provided", async () => {
    await db
      .insert(organizations)
      .values({ id: "test-org-005", name: "Test Org 005" })
      .onConflictDoNothing();
    try {
      await bootstrapProfile({ db, user_id: testUserId, org_id: "test-org-005" });
      const rows = await db.select().from(profiles).where(eq(profiles.user_id, testUserId));
      expect(rows).toHaveLength(1);
      expect(rows[0]!.org_id).toBe("test-org-005");
    } finally {
      await db.delete(profiles).where(eq(profiles.user_id, testUserId));
      await db.delete(organizations).where(eq(organizations.id, "test-org-005"));
    }
  });
});
