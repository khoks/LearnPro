import { DEFAULT_QUIET_HOURS_CONFIG } from "@learnpro/scoring";
import { eq } from "drizzle-orm";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type LearnProDb } from "./client.js";
import { runMigrations } from "./migrate.js";
import { getQuietHoursConfig, updateQuietHoursConfig } from "./quiet-hours.js";
import { organizations, profiles, users } from "./schema.js";

const DATABASE_URL = process.env["DATABASE_URL"];

// Integration tests against a real Postgres (Docker Compose). Skipped when DATABASE_URL is unset.
describe.skipIf(!DATABASE_URL)("quiet-hours DB helpers (integration)", () => {
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
      .values({ email: `quiet-hours-test-${Date.now()}@learnpro.local` })
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

  describe("getQuietHoursConfig", () => {
    it("returns DEFAULT_QUIET_HOURS_CONFIG when no profile row exists", async () => {
      const config = await getQuietHoursConfig(db, testUserId);
      expect(config).toEqual(DEFAULT_QUIET_HOURS_CONFIG);
    });

    it("returns the row's values when a profile row exists", async () => {
      await db.insert(profiles).values({
        user_id: testUserId,
        org_id: "self",
        quiet_hours_enabled: false,
        quiet_hours_start_min: 21 * 60,
        quiet_hours_end_min: 7 * 60,
        timezone: "America/Los_Angeles",
      });
      const config = await getQuietHoursConfig(db, testUserId);
      expect(config.enabled).toBe(false);
      expect(config.start_min).toBe(21 * 60);
      expect(config.end_min).toBe(7 * 60);
      expect(config.timezone).toBe("America/Los_Angeles");
    });
  });

  describe("updateQuietHoursConfig", () => {
    it("inserts a fresh profile row when none exists", async () => {
      await updateQuietHoursConfig({
        db,
        user_id: testUserId,
        config: {
          enabled: true,
          start_min: 23 * 60,
          end_min: 6 * 60,
          timezone: "Europe/London",
        },
      });
      const config = await getQuietHoursConfig(db, testUserId);
      expect(config.enabled).toBe(true);
      expect(config.start_min).toBe(23 * 60);
      expect(config.end_min).toBe(6 * 60);
      expect(config.timezone).toBe("Europe/London");
    });

    it("updates an existing profile row's quiet-hours columns without clobbering other fields", async () => {
      await db.insert(profiles).values({
        user_id: testUserId,
        org_id: "self",
        target_role: "backend engineer",
      });
      await updateQuietHoursConfig({
        db,
        user_id: testUserId,
        config: {
          enabled: false,
          start_min: 22 * 60,
          end_min: 8 * 60,
          timezone: "Asia/Tokyo",
        },
      });
      const rows = await db.select().from(profiles).where(eq(profiles.user_id, testUserId));
      const row = rows[0]!;
      expect(row.quiet_hours_enabled).toBe(false);
      expect(row.timezone).toBe("Asia/Tokyo");
      expect(row.target_role).toBe("backend engineer");
    });

    it("idempotent — calling twice yields the same final state", async () => {
      const config = {
        enabled: true,
        start_min: 22 * 60,
        end_min: 8 * 60,
        timezone: "UTC",
      };
      await updateQuietHoursConfig({ db, user_id: testUserId, config });
      await updateQuietHoursConfig({ db, user_id: testUserId, config });
      const got = await getQuietHoursConfig(db, testUserId);
      expect(got).toEqual(config);
    });
  });
});
