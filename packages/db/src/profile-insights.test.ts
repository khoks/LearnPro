import { eq } from "drizzle-orm";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type LearnProDb } from "./client.js";
import { runMigrations } from "./migrate.js";
import {
  DEFAULT_INSIGHT_TTL_DAYS,
  deleteExpiredInsights,
  getInsightTelemetry,
  incrementReferenced,
  insertInsight,
  listEpisodesForSynthesis,
  listLatestInsights,
} from "./profile-insights.js";
import {
  episodes,
  organizations,
  problems,
  profile_insights,
  tracks,
  users,
} from "./schema.js";

const DATABASE_URL = process.env["DATABASE_URL"];

describe.skipIf(!DATABASE_URL)("profile_insights DB helpers (integration)", () => {
  let db: LearnProDb;
  let pool: Pool;
  let testUserId: string;
  let otherUserId: string;
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
      .values({ email: `insights-test-${Date.now()}@learnpro.local` })
      .returning({ id: users.id });
    testUserId = userRow[0]?.id ?? "";
    const otherRow = await db
      .insert(users)
      .values({ email: `insights-other-${Date.now()}@learnpro.local` })
      .returning({ id: users.id });
    otherUserId = otherRow[0]?.id ?? "";
    const trackRow = await db
      .insert(tracks)
      .values({
        slug: `insights-track-${Date.now()}`,
        name: "Insights Test Track",
        language: "python",
      })
      .returning({ id: tracks.id });
    trackId = trackRow[0]?.id ?? "";
    const problemRow = await db
      .insert(problems)
      .values({
        track_id: trackId,
        slug: "insights-test-problem",
        name: "Insights Test Problem",
        language: "python",
        difficulty: "easy",
        statement: "test",
        hidden_tests: { cases: [], concept_tags: ["arrays", "loops"] },
      })
      .returning({ id: problems.id });
    problemId = problemRow[0]?.id ?? "";
  });

  afterAll(async () => {
    if (db) {
      await db.delete(profile_insights).where(eq(profile_insights.user_id, testUserId));
      await db.delete(profile_insights).where(eq(profile_insights.user_id, otherUserId));
      await db.delete(episodes).where(eq(episodes.user_id, testUserId));
      await db.delete(episodes).where(eq(episodes.user_id, otherUserId));
      await db.delete(problems).where(eq(problems.id, problemId));
      await db.delete(tracks).where(eq(tracks.id, trackId));
      await db.delete(users).where(eq(users.id, testUserId));
      await db.delete(users).where(eq(users.id, otherUserId));
    }
    await pool?.end();
  });

  beforeEach(async () => {
    await db.delete(profile_insights).where(eq(profile_insights.user_id, testUserId));
    await db.delete(profile_insights).where(eq(profile_insights.user_id, otherUserId));
    await db.delete(episodes).where(eq(episodes.user_id, testUserId));
    await db.delete(episodes).where(eq(episodes.user_id, otherUserId));
  });

  it("inserts an insight with a default 30-day expires_at and 0 referenced_count", async () => {
    const before = Date.now();
    const r = await insertInsight(db, {
      user_id: testUserId,
      insight_text: "user reaches for `for` when comprehensions would be cleaner",
      concept_tags: ["loops"],
      episodes_covered: [],
    });
    expect(r.insight_text).toContain("comprehensions");
    expect(r.referenced_count).toBe(0);
    expect(r.concept_tags).toEqual(["loops"]);
    expect(r.expires_at).not.toBeNull();
    const ttlMs = (r.expires_at as Date).getTime() - r.created_at.getTime();
    const expectedMs = DEFAULT_INSIGHT_TTL_DAYS * 24 * 60 * 60 * 1000;
    expect(Math.abs(ttlMs - expectedMs)).toBeLessThan(1000);
    expect(r.created_at.getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  it("listLatestInsights returns non-expired rows newest-first, capped at limit", async () => {
    const now = new Date();
    await insertInsight(db, {
      user_id: testUserId,
      insight_text: "old",
      now: new Date(now.getTime() - 10_000),
    });
    await insertInsight(db, {
      user_id: testUserId,
      insight_text: "newer",
      now: new Date(now.getTime() - 5_000),
    });
    await insertInsight(db, {
      user_id: testUserId,
      insight_text: "newest",
      now,
    });
    const rows = await listLatestInsights(db, testUserId, 2);
    expect(rows.map((r) => r.insight_text)).toEqual(["newest", "newer"]);
  });

  it("listLatestInsights filters out expired insights", async () => {
    const now = new Date();
    await insertInsight(db, {
      user_id: testUserId,
      insight_text: "expired",
      now: new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000),
    });
    await insertInsight(db, {
      user_id: testUserId,
      insight_text: "active",
      now,
    });
    const rows = await listLatestInsights(db, testUserId, 5);
    expect(rows.map((r) => r.insight_text)).toEqual(["active"]);
  });

  it("listLatestInsights doesn't bleed across users", async () => {
    await insertInsight(db, { user_id: testUserId, insight_text: "for me" });
    await insertInsight(db, { user_id: otherUserId, insight_text: "for them" });
    const mine = await listLatestInsights(db, testUserId, 5);
    const theirs = await listLatestInsights(db, otherUserId, 5);
    expect(mine.map((r) => r.insight_text)).toEqual(["for me"]);
    expect(theirs.map((r) => r.insight_text)).toEqual(["for them"]);
  });

  it("incrementReferenced bumps the count and is repeatable", async () => {
    const r = await insertInsight(db, { user_id: testUserId, insight_text: "obs" });
    const r1 = await incrementReferenced(db, r.id);
    expect(r1).toEqual({ updated: true, new_count: 1 });
    const r2 = await incrementReferenced(db, r.id);
    expect(r2).toEqual({ updated: true, new_count: 2 });
    const r3 = await incrementReferenced(db, "00000000-0000-4000-8000-000000000000");
    expect(r3).toEqual({ updated: false, new_count: null });
  });

  it("getInsightTelemetry reports active count + average referenced count", async () => {
    const a = await insertInsight(db, { user_id: testUserId, insight_text: "a" });
    const b = await insertInsight(db, { user_id: testUserId, insight_text: "b" });
    await insertInsight(db, { user_id: testUserId, insight_text: "c" });
    await incrementReferenced(db, a.id);
    await incrementReferenced(db, a.id);
    await incrementReferenced(db, b.id);
    const t = await getInsightTelemetry(db, testUserId);
    expect(t.active_count).toBe(3);
    // Average of (2, 1, 0) = 1
    expect(t.avg_referenced_count_per_insight).toBeCloseTo(1, 5);
  });

  it("getInsightTelemetry returns 0/0 when the user has no insights", async () => {
    const t = await getInsightTelemetry(db, testUserId);
    expect(t).toEqual({ active_count: 0, avg_referenced_count_per_insight: 0 });
  });

  it("deleteExpiredInsights removes rows past their expires_at", async () => {
    const now = new Date();
    await insertInsight(db, {
      user_id: testUserId,
      insight_text: "expired",
      now: new Date(now.getTime() - 35 * 24 * 60 * 60 * 1000),
    });
    await insertInsight(db, { user_id: testUserId, insight_text: "active", now });
    const r = await deleteExpiredInsights(db);
    expect(r.deleted).toBe(1);
    const remaining = await listLatestInsights(db, testUserId, 10);
    expect(remaining.map((x) => x.insight_text)).toEqual(["active"]);
  });

  it("listEpisodesForSynthesis joins problems and extracts concept_tags from hidden_tests", async () => {
    await db.insert(episodes).values([
      {
        user_id: testUserId,
        problem_id: problemId,
        org_id: "self",
        finished_at: new Date(),
        final_outcome: "passed",
        hints_used: 0,
        attempts: 1,
        time_to_solve_ms: 60000,
      },
      {
        user_id: testUserId,
        problem_id: problemId,
        org_id: "self",
        finished_at: new Date(),
        final_outcome: "failed",
        hints_used: 1,
        attempts: 3,
        time_to_solve_ms: 240000,
      },
    ]);
    const rows = await listEpisodesForSynthesis(db, testUserId, 30);
    expect(rows.length).toBe(2);
    expect(rows[0]?.problem_slug).toBe("insights-test-problem");
    expect(rows[0]?.concept_tags).toEqual(["arrays", "loops"]);
    expect(rows[0]?.problem_language).toBe("python");
  });

  it("listEpisodesForSynthesis ignores episodes outside the window", async () => {
    const now = new Date();
    const old = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    await db.insert(episodes).values([
      {
        user_id: testUserId,
        problem_id: problemId,
        org_id: "self",
        started_at: old,
        finished_at: old,
        final_outcome: "passed",
      },
    ]);
    const rows = await listEpisodesForSynthesis(db, testUserId, 30, now);
    expect(rows).toHaveLength(0);
  });
});
