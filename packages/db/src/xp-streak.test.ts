import { eq, inArray } from "drizzle-orm";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type LearnProDb } from "./client.js";
import { runMigrations } from "./migrate.js";
import {
  concepts,
  episodes,
  organizations,
  problems,
  skill_scores,
  tracks,
  users,
  xp_awards,
} from "./schema.js";
import {
  awardXp,
  consumeGraceDay,
  getActiveTrackSlugs,
  getStreakInputs,
  getStreakSnapshot,
  getTrackProgress,
  getUserXp,
  replenishGraceDays,
} from "./xp-streak.js";

const DATABASE_URL = process.env["DATABASE_URL"];

// All `xp-streak` helpers run against a real Postgres (Docker Compose). Skipped when
// DATABASE_URL is unset so `pnpm test` stays clean in CI without a DB.
// Run locally with: `DATABASE_URL=postgresql://learnpro:learnpro@localhost:5432/learnpro pnpm --filter @learnpro/db test`
describe.skipIf(!DATABASE_URL)("xp-streak (integration)", () => {
  let db: LearnProDb;
  let pool: Pool;
  let testUserId: string;
  let testTrackId: string;
  let testProblemId: string;
  let testConceptIds: string[] = [];

  beforeAll(async () => {
    const created = createDb({ connectionString: DATABASE_URL ?? "" });
    db = created.db;
    pool = created.pool;
    await runMigrations();
    await db
      .insert(organizations)
      .values({ id: "self", name: "Self-hosted" })
      .onConflictDoNothing();

    const insertedUser = await db
      .insert(users)
      .values({ email: `xp-streak-test-${Date.now()}@learnpro.local` })
      .returning({ id: users.id });
    testUserId = insertedUser[0]!.id;

    const insertedTrack = await db
      .insert(tracks)
      .values({
        slug: `xp-streak-track-${Date.now()}`,
        name: "XP streak test track",
        language: "python",
      })
      .returning({ id: tracks.id });
    testTrackId = insertedTrack[0]!.id;

    const insertedProblem = await db
      .insert(problems)
      .values({
        track_id: testTrackId,
        slug: `xp-streak-problem-${Date.now()}`,
        name: "XP streak test problem",
        language: "python",
        difficulty: "2",
        statement: "noop",
        hidden_tests: { cases: [], concept_tags: ["arrays", "loops"] },
      })
      .returning({ id: problems.id });
    testProblemId = insertedProblem[0]!.id;

    const conceptRows = await db
      .insert(concepts)
      .values([
        { slug: `arrays-${Date.now()}`, name: "Arrays test", language: "python" },
        { slug: `loops-${Date.now()}`, name: "Loops test", language: "python" },
      ])
      .returning({ id: concepts.id });
    testConceptIds = conceptRows.map((r) => r.id);
  });

  afterAll(async () => {
    if (db) {
      await db.delete(xp_awards).where(eq(xp_awards.user_id, testUserId));
      await db.delete(skill_scores).where(eq(skill_scores.user_id, testUserId));
      await db.delete(episodes).where(eq(episodes.user_id, testUserId));
      await db.delete(problems).where(eq(problems.id, testProblemId));
      await db.delete(tracks).where(eq(tracks.id, testTrackId));
      if (testConceptIds.length > 0) {
        await db.delete(concepts).where(inArray(concepts.id, testConceptIds));
      }
      await db.delete(users).where(eq(users.id, testUserId));
    }
    await pool?.end();
  });

  beforeEach(async () => {
    await db.delete(xp_awards).where(eq(xp_awards.user_id, testUserId));
    await db.delete(skill_scores).where(eq(skill_scores.user_id, testUserId));
    await db.delete(episodes).where(eq(episodes.user_id, testUserId));
    await db
      .update(users)
      .set({
        xp: 0,
        streak_grace_days_remaining: 2,
        streak_grace_last_replenished_at: null,
      })
      .where(eq(users.id, testUserId));
  });

  describe("getUserXp", () => {
    it("returns 0 for a freshly-reset user", async () => {
      expect(await getUserXp(db, testUserId)).toBe(0);
    });

    it("returns 0 when the user_id is unknown", async () => {
      expect(await getUserXp(db, "00000000-0000-4000-8000-000000000000")).toBe(0);
    });
  });

  describe("awardXp", () => {
    it("inserts an xp_awards row + increments users.xp", async () => {
      const result = await awardXp(db, {
        user_id: testUserId,
        episode_id: null,
        amount: 25,
        reason: "episode-passed",
      });
      expect(result).toEqual({ inserted: true, amount: 25 });
      expect(await getUserXp(db, testUserId)).toBe(25);
    });

    it("is idempotent on (user_id, episode_id, reason) — second insert is a no-op", async () => {
      const epRow = await db
        .insert(episodes)
        .values({ user_id: testUserId, problem_id: testProblemId })
        .returning({ id: episodes.id });
      const ep_id = epRow[0]!.id;

      const first = await awardXp(db, {
        user_id: testUserId,
        episode_id: ep_id,
        amount: 25,
        reason: "episode-passed",
      });
      expect(first.inserted).toBe(true);

      const second = await awardXp(db, {
        user_id: testUserId,
        episode_id: ep_id,
        amount: 25,
        reason: "episode-passed",
      });
      expect(second.inserted).toBe(false);
      expect(second.amount).toBe(0);
      expect(await getUserXp(db, testUserId)).toBe(25);
    });

    it("allows different reasons for the same episode (badge bonus on top of base)", async () => {
      const epRow = await db
        .insert(episodes)
        .values({ user_id: testUserId, problem_id: testProblemId })
        .returning({ id: episodes.id });
      const ep_id = epRow[0]!.id;

      await awardXp(db, {
        user_id: testUserId,
        episode_id: ep_id,
        amount: 20,
        reason: "episode-passed",
      });
      await awardXp(db, {
        user_id: testUserId,
        episode_id: ep_id,
        amount: 5,
        reason: "concept-mastery-bonus",
      });
      expect(await getUserXp(db, testUserId)).toBe(25);
    });

    it("zero-amount grants insert the row but leave xp unchanged", async () => {
      const epRow = await db
        .insert(episodes)
        .values({ user_id: testUserId, problem_id: testProblemId })
        .returning({ id: episodes.id });
      const ep_id = epRow[0]!.id;

      const r = await awardXp(db, {
        user_id: testUserId,
        episode_id: ep_id,
        amount: 0,
        reason: "episode-failed",
      });
      expect(r).toEqual({ inserted: true, amount: 0 });
      expect(await getUserXp(db, testUserId)).toBe(0);

      const rows = await db.select().from(xp_awards).where(eq(xp_awards.user_id, testUserId));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.reason).toBe("episode-failed");
    });
  });

  describe("replenishGraceDays + consumeGraceDay", () => {
    it("first call refills the counter to monthly_cap", async () => {
      await consumeGraceDay(db, testUserId, 2); // drain it
      expect((await readUser()).remaining).toBe(0);

      const r = await replenishGraceDays(db, testUserId, 2, new Date());
      expect(r.replenished).toBe(true);
      expect((await readUser()).remaining).toBe(2);
    });

    it("subsequent same-month calls are no-ops", async () => {
      const t = new Date(Date.UTC(2026, 4, 15));
      await replenishGraceDays(db, testUserId, 2, t);
      await consumeGraceDay(db, testUserId, 1);
      const second = await replenishGraceDays(db, testUserId, 2, t);
      expect(second.replenished).toBe(false);
      expect((await readUser()).remaining).toBe(1);
    });

    it("crosses a month boundary → re-refills", async () => {
      const may = new Date(Date.UTC(2026, 4, 15));
      const june = new Date(Date.UTC(2026, 5, 1));
      await replenishGraceDays(db, testUserId, 2, may);
      await consumeGraceDay(db, testUserId, 2);
      const r = await replenishGraceDays(db, testUserId, 2, june);
      expect(r.replenished).toBe(true);
      expect((await readUser()).remaining).toBe(2);
    });

    it("consumeGraceDay floors at 0", async () => {
      await consumeGraceDay(db, testUserId, 100); // way more than the budget
      expect((await readUser()).remaining).toBe(0);
    });
  });

  describe("getStreakInputs + getStreakSnapshot", () => {
    it("aggregates distinct UTC days and lazy-refills the grace counter", async () => {
      // Three episodes finished today, yesterday, day-before-yesterday.
      const today = new Date();
      await insertFinishedEpisode(today);
      await insertFinishedEpisode(addDays(today, -1));
      await insertFinishedEpisode(addDays(today, -2));
      // Plus a duplicate episode on yesterday that should collapse.
      await insertFinishedEpisode(addDays(today, -1));

      const inputs = await getStreakInputs(db, testUserId, today);
      expect(inputs.episodeDays.length).toBe(3);
      expect(inputs.graceDaysRemaining).toBe(2); // refilled

      const snap = await getStreakSnapshot(db, testUserId, today);
      expect(snap.streakDays).toBe(3);
      expect(snap.graceDaysUsed).toBe(0);
    });

    it("uses a grace day to bridge a single-day gap", async () => {
      const today = new Date();
      await insertFinishedEpisode(today);
      // skip yesterday
      await insertFinishedEpisode(addDays(today, -2));

      const snap = await getStreakSnapshot(db, testUserId, today);
      expect(snap.streakDays).toBe(3);
      expect(snap.graceDaysUsed).toBe(1);
    });

    it("returns a 0-day streak for a brand-new user", async () => {
      const snap = await getStreakSnapshot(db, testUserId, new Date());
      expect(snap.streakDays).toBe(0);
    });
  });

  describe("getActiveTrackSlugs", () => {
    it("returns the user's started-on track slugs (newest first)", async () => {
      await insertFinishedEpisode(new Date());
      const slugs = await getActiveTrackSlugs(db, testUserId);
      expect(slugs).toContain(
        (await db.select({ slug: tracks.slug }).from(tracks).where(eq(tracks.id, testTrackId)))[0]!
          .slug,
      );
    });

    it("returns [] when the user has zero episodes", async () => {
      const slugs = await getActiveTrackSlugs(db, testUserId);
      expect(slugs).toEqual([]);
    });
  });

  describe("getTrackProgress", () => {
    it("returns null for an unknown track slug", async () => {
      const r = await getTrackProgress(db, testUserId, "no-such-track");
      expect(r).toBeNull();
    });

    it("counts unique concept_tags across the track's problems as `total`", async () => {
      const trackRow = await db
        .select({ slug: tracks.slug })
        .from(tracks)
        .where(eq(tracks.id, testTrackId));
      const slug = trackRow[0]!.slug;

      const r = await getTrackProgress(db, testUserId, slug);
      expect(r?.total).toBe(2); // arrays + loops
      expect(r?.mastered).toBe(0); // no skill_scores yet
      expect(r?.ratio).toBe(0);
    });

    it("counts mastered concepts (confidence >= threshold) on the user's language", async () => {
      const trackRow = await db
        .select({ slug: tracks.slug })
        .from(tracks)
        .where(eq(tracks.id, testTrackId));
      const slug = trackRow[0]!.slug;

      // Mark "arrays" mastered for our user (confidence 60 ≥ 50). The concept slug must match
      // the tag in problems.hidden_tests.concept_tags — we re-fetch the seeded slug.
      const seededConcepts = await db
        .select({ id: concepts.id, slug: concepts.slug })
        .from(concepts)
        .where(inArray(concepts.id, testConceptIds));
      const arraysConcept = seededConcepts.find((c) => c.slug.startsWith("arrays-"));
      expect(arraysConcept).toBeDefined();

      // The problem's hidden_tests.concept_tags is ["arrays", "loops"] (without timestamp), so
      // we update the problem to use the timestamped slug too.
      await db
        .update(problems)
        .set({ hidden_tests: { cases: [], concept_tags: [arraysConcept!.slug, "loops-other"] } })
        .where(eq(problems.id, testProblemId));

      await db.insert(skill_scores).values({
        user_id: testUserId,
        concept_id: arraysConcept!.id,
        score: 80,
        confidence: 60,
      });

      const r = await getTrackProgress(db, testUserId, slug);
      expect(r?.total).toBe(2);
      expect(r?.mastered).toBe(1);
      expect(r?.ratio).toBe(0.5);
    });
  });

  // ---- helpers ----
  async function readUser(): Promise<{ remaining: number; xp: number }> {
    const row = await db
      .select({
        xp: users.xp,
        remaining: users.streak_grace_days_remaining,
      })
      .from(users)
      .where(eq(users.id, testUserId))
      .limit(1);
    return row[0]!;
  }

  async function insertFinishedEpisode(finishedAt: Date): Promise<void> {
    await db.insert(episodes).values({
      user_id: testUserId,
      problem_id: testProblemId,
      started_at: addDays(finishedAt, 0),
      finished_at: finishedAt,
      final_outcome: "passed",
    });
  }
});

function addDays(d: Date, deltaDays: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + deltaDays));
}
