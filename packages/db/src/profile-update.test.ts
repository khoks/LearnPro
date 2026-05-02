import { eq } from "drizzle-orm";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type LearnProDb } from "./client.js";
import { runMigrations } from "./migrate.js";
import { bootstrapProfile } from "./profile-bootstrap.js";
import { updateProfileFields } from "./profile-update.js";
import { organizations, profiles, users } from "./schema.js";

const DATABASE_URL = process.env["DATABASE_URL"];

// Integration tests for the conversational-onboarding profile writer (STORY-053). Skipped when
// DATABASE_URL isn't set so `pnpm test` still passes in CI. Run locally with:
//   DATABASE_URL=postgresql://learnpro:learnpro@localhost:5432/learnpro pnpm --filter @learnpro/db test
describe.skipIf(!DATABASE_URL)("updateProfileFields (integration)", () => {
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
      .values({ email: `profile-update-test-${Date.now()}@learnpro.local` })
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
    await bootstrapProfile({ db, user_id: testUserId });
  });

  it("writes only the supplied fields and leaves others null", async () => {
    const changed = await updateProfileFields({
      db,
      user_id: testUserId,
      updates: { target_role: "swe_intern" },
    });
    expect(changed).toBe(true);
    const rows = await db.select().from(profiles).where(eq(profiles.user_id, testUserId));
    expect(rows[0]?.target_role).toBe("swe_intern");
    expect(rows[0]?.time_budget_min).toBeNull();
    expect(rows[0]?.primary_goal).toBeNull();
  });

  it("two sequential calls accumulate (no clobbering of previously-set fields)", async () => {
    await updateProfileFields({
      db,
      user_id: testUserId,
      updates: { target_role: "swe_intern", time_budget_min: 30 },
    });
    await updateProfileFields({
      db,
      user_id: testUserId,
      updates: { primary_goal: "land an internship" },
    });
    const rows = await db.select().from(profiles).where(eq(profiles.user_id, testUserId));
    expect(rows[0]?.target_role).toBe("swe_intern");
    expect(rows[0]?.time_budget_min).toBe(30);
    expect(rows[0]?.primary_goal).toBe("land an internship");
  });

  it("explicit null is skipped — does not clobber a previously-captured value", async () => {
    await updateProfileFields({
      db,
      user_id: testUserId,
      updates: { target_role: "swe_intern" },
    });
    const changed = await updateProfileFields({
      db,
      user_id: testUserId,
      updates: { target_role: null, time_budget_min: 45 },
    });
    expect(changed).toBe(true);
    const rows = await db.select().from(profiles).where(eq(profiles.user_id, testUserId));
    expect(rows[0]?.target_role).toBe("swe_intern"); // not clobbered
    expect(rows[0]?.time_budget_min).toBe(45);
  });

  it("an empty updates object is a no-op (returns false)", async () => {
    const changed = await updateProfileFields({
      db,
      user_id: testUserId,
      updates: {},
    });
    expect(changed).toBe(false);
  });

  it("language_comfort persists as JSONB and round-trips structurally", async () => {
    await updateProfileFields({
      db,
      user_id: testUserId,
      updates: {
        language_comfort: { python: "comfortable", typescript: "rusty", rust: "new" },
      },
    });
    const rows = await db.select().from(profiles).where(eq(profiles.user_id, testUserId));
    expect(rows[0]?.language_comfort).toEqual({
      python: "comfortable",
      typescript: "rusty",
      rust: "new",
    });
  });

  it("creates the profile row when none exists yet (race-against-bootstrap path)", async () => {
    await db.delete(profiles).where(eq(profiles.user_id, testUserId));
    const changed = await updateProfileFields({
      db,
      user_id: testUserId,
      updates: { target_role: "swe_intern", time_budget_min: 60 },
    });
    expect(changed).toBe(true);
    const rows = await db.select().from(profiles).where(eq(profiles.user_id, testUserId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.target_role).toBe("swe_intern");
    expect(rows[0]?.time_budget_min).toBe(60);
  });
});
