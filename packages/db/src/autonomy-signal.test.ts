import { eq } from "drizzle-orm";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  countClosedEpisodes,
  getConfidenceSignal,
  updateConfidenceSignalRow,
} from "./autonomy-signal.js";
import { createDb, type LearnProDb } from "./client.js";
import { runMigrations } from "./migrate.js";
import { episodes, organizations, problems, profiles, tracks, users } from "./schema.js";

const DATABASE_URL = process.env["DATABASE_URL"];

describe.skipIf(!DATABASE_URL)("autonomy-signal DB helpers (integration)", () => {
  let db: LearnProDb;
  let pool: Pool;
  let testUserId: string;
  let trackId: string;
  let problemId: string;

  beforeAll(async () => {
    const created = createDb({ connectionString: DATABASE_URL ?? "" });
    db = created.db;
    pool = created.pool;
    await runMigrations();
    await db
      .insert(organizations)
      .values({ id: "self", name: "Self-hosted" })
      .onConflictDoNothing();
    const userRow = await db
      .insert(users)
      .values({ email: `autonomy-signal-test-${Date.now()}@learnpro.local` })
      .returning({ id: users.id });
    testUserId = userRow[0]?.id ?? "";
    const trackRow = await db
      .insert(tracks)
      .values({
        slug: `autonomy-track-${Date.now()}`,
        name: "Test Track",
        language: "python",
      })
      .returning({ id: tracks.id });
    trackId = trackRow[0]?.id ?? "";
    const problemRow = await db
      .insert(problems)
      .values({
        track_id: trackId,
        slug: "autonomy-test-problem",
        name: "Autonomy Test Problem",
        language: "python",
        difficulty: "easy",
        statement: "test",
        hidden_tests: [],
      })
      .returning({ id: problems.id });
    problemId = problemRow[0]?.id ?? "";
  });

  afterAll(async () => {
    if (db) {
      await db.delete(episodes).where(eq(episodes.user_id, testUserId));
      await db.delete(profiles).where(eq(profiles.user_id, testUserId));
      await db.delete(problems).where(eq(problems.id, problemId));
      await db.delete(tracks).where(eq(tracks.id, trackId));
      await db.delete(users).where(eq(users.id, testUserId));
    }
    await pool?.end();
  });

  beforeEach(async () => {
    await db.delete(episodes).where(eq(episodes.user_id, testUserId));
    await db.delete(profiles).where(eq(profiles.user_id, testUserId));
  });

  describe("getConfidenceSignal", () => {
    it("returns null when no profile row exists (cold-start)", async () => {
      const signal = await getConfidenceSignal(db, testUserId);
      expect(signal).toBeNull();
    });

    it("returns null when the profile row exists but confidence_signal is null", async () => {
      await db.insert(profiles).values({ user_id: testUserId, org_id: "self" });
      const signal = await getConfidenceSignal(db, testUserId);
      expect(signal).toBeNull();
    });

    it("returns the signal when one is persisted", async () => {
      const stored = {
        agreement_rate: 0.7,
        engagement: 0.65,
        success: 0.8,
        updated_at: new Date("2026-04-25T12:00:00.000Z").toISOString(),
      };
      await db
        .insert(profiles)
        .values({ user_id: testUserId, org_id: "self", confidence_signal: stored });
      const signal = await getConfidenceSignal(db, testUserId);
      expect(signal).toEqual(stored);
    });

    it("returns null when the persisted signal fails Zod validation", async () => {
      // Inject a malformed signal directly so we exercise the safe-parse fallback.
      await db.insert(profiles).values({
        user_id: testUserId,
        org_id: "self",
        // Missing required fields (engagement, success, updated_at)
        confidence_signal: { agreement_rate: 0.5 },
      });
      const signal = await getConfidenceSignal(db, testUserId);
      expect(signal).toBeNull();
    });
  });

  describe("updateConfidenceSignalRow", () => {
    it("inserts a fresh profile row when none exists", async () => {
      const next = {
        agreement_rate: 0.4,
        engagement: 0.5,
        success: 0.6,
        updated_at: new Date("2026-04-25T12:00:00.000Z").toISOString(),
      };
      await updateConfidenceSignalRow({ db, user_id: testUserId, signal: next });
      const got = await getConfidenceSignal(db, testUserId);
      expect(got).toEqual(next);
    });

    it("updates an existing profile row's confidence_signal without clobbering other fields", async () => {
      await db.insert(profiles).values({
        user_id: testUserId,
        org_id: "self",
        target_role: "frontend engineer",
      });
      const next = {
        agreement_rate: 0.5,
        engagement: 0.5,
        success: 0.5,
        updated_at: new Date("2026-04-25T12:00:00.000Z").toISOString(),
      };
      await updateConfidenceSignalRow({ db, user_id: testUserId, signal: next });
      const rows = await db.select().from(profiles).where(eq(profiles.user_id, testUserId));
      expect(rows[0]?.target_role).toBe("frontend engineer");
      expect(rows[0]?.confidence_signal).toEqual(next);
    });

    it("idempotent — calling twice yields the same final state", async () => {
      const signal = {
        agreement_rate: 0.5,
        engagement: 0.5,
        success: 0.5,
        updated_at: new Date("2026-04-25T12:00:00.000Z").toISOString(),
      };
      await updateConfidenceSignalRow({ db, user_id: testUserId, signal });
      await updateConfidenceSignalRow({ db, user_id: testUserId, signal });
      const got = await getConfidenceSignal(db, testUserId);
      expect(got).toEqual(signal);
    });
  });

  describe("countClosedEpisodes", () => {
    it("returns 0 when no episodes exist", async () => {
      const c = await countClosedEpisodes(db, testUserId);
      expect(c).toBe(0);
    });

    it("counts only closed episodes (final_outcome IS NOT NULL)", async () => {
      await db.insert(episodes).values({
        user_id: testUserId,
        problem_id: problemId,
        final_outcome: "passed",
      });
      await db.insert(episodes).values({
        user_id: testUserId,
        problem_id: problemId,
        final_outcome: "failed",
      });
      // An open episode must NOT count.
      await db.insert(episodes).values({
        user_id: testUserId,
        problem_id: problemId,
      });
      const c = await countClosedEpisodes(db, testUserId);
      expect(c).toBe(2);
    });
  });
});
