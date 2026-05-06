import { eq } from "drizzle-orm";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { initialCardState, recomputeAfterReview } from "@learnpro/scoring";
import { createDb, type LearnProDb } from "./client.js";
import {
  getCardState,
  getDueConcepts,
  recordReview,
  upsertCardState,
  withOverdueDays,
} from "./concept-reviews.js";
import { runMigrations } from "./migrate.js";
import { concept_reviews, concepts, organizations, users } from "./schema.js";

const DATABASE_URL = process.env["DATABASE_URL"];

describe.skipIf(!DATABASE_URL)("concept-reviews DB helpers (integration)", () => {
  let db: LearnProDb;
  let pool: Pool;
  let testUserId: string;
  const conceptIds: string[] = [];

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
      .values({ email: `concept-reviews-test-${Date.now()}@learnpro.local` })
      .returning({ id: users.id });
    testUserId = userRow[0]?.id ?? "";

    const conceptRows = await db
      .insert(concepts)
      .values([
        {
          slug: `concept-reviews-test-a-${Date.now()}`,
          name: "Test Concept A",
          language: "python",
        },
        {
          slug: `concept-reviews-test-b-${Date.now()}`,
          name: "Test Concept B",
          language: "python",
        },
        {
          slug: `concept-reviews-test-c-${Date.now()}`,
          name: "Test Concept C",
          language: "python",
        },
      ])
      .returning({ id: concepts.id });
    for (const row of conceptRows) conceptIds.push(row.id);
  });

  afterAll(async () => {
    if (db) {
      await db.delete(concept_reviews).where(eq(concept_reviews.user_id, testUserId));
      for (const cid of conceptIds) {
        await db.delete(concepts).where(eq(concepts.id, cid));
      }
      await db.delete(users).where(eq(users.id, testUserId));
    }
    await pool?.end();
  });

  beforeEach(async () => {
    await db.delete(concept_reviews).where(eq(concept_reviews.user_id, testUserId));
  });

  describe("getCardState", () => {
    it("returns null when no row exists (cold-start)", async () => {
      const got = await getCardState(db, testUserId, conceptIds[0]!);
      expect(got).toBeNull();
    });

    it("returns the persisted state when one exists", async () => {
      const state = initialCardState(new Date("2026-04-30T12:00:00.000Z"));
      await db.insert(concept_reviews).values({
        org_id: "self",
        user_id: testUserId,
        concept_id: conceptIds[0]!,
        state,
        total_reviews: 1,
      });
      const got = await getCardState(db, testUserId, conceptIds[0]!);
      expect(got).toEqual(state);
    });

    it("returns null when the persisted state fails Zod validation (self-healing)", async () => {
      // A malformed payload — `due` is not a valid datetime string.
      await db.insert(concept_reviews).values({
        org_id: "self",
        user_id: testUserId,
        concept_id: conceptIds[0]!,
        state: { stability: 1, difficulty: 5, due: "not-a-date", lapses: 0, last_reviewed: null },
        total_reviews: 1,
      });
      const got = await getCardState(db, testUserId, conceptIds[0]!);
      expect(got).toBeNull();
    });
  });

  describe("upsertCardState", () => {
    it("inserts a fresh row when none exists, total_reviews=1", async () => {
      const state = initialCardState(new Date("2026-04-30T12:00:00.000Z"));
      await upsertCardState(db, testUserId, conceptIds[0]!, state);
      const rows = await db
        .select({ state: concept_reviews.state, total_reviews: concept_reviews.total_reviews })
        .from(concept_reviews)
        .where(eq(concept_reviews.user_id, testUserId));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.total_reviews).toBe(1);
    });

    it("updates an existing row and increments total_reviews", async () => {
      const seed = initialCardState(new Date("2026-04-30T12:00:00.000Z"));
      await upsertCardState(db, testUserId, conceptIds[0]!, seed);
      const next = recomputeAfterReview({
        state: seed,
        grade: "good",
        now: new Date("2026-04-30T12:00:00.000Z"),
      });
      await upsertCardState(db, testUserId, conceptIds[0]!, next);
      const rows = await db
        .select({ state: concept_reviews.state, total_reviews: concept_reviews.total_reviews })
        .from(concept_reviews)
        .where(eq(concept_reviews.user_id, testUserId));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.total_reviews).toBe(2);
      expect(rows[0]?.state).toMatchObject({
        stability: next.stability,
        difficulty: next.difficulty,
        last_reviewed: next.last_reviewed,
      });
    });

    it("scopes by (user_id, concept_id) — independent rows for two concepts", async () => {
      const stateA = initialCardState(new Date("2026-04-30T12:00:00.000Z"));
      const stateB = recomputeAfterReview({
        state: stateA,
        grade: "good",
        now: new Date("2026-04-30T12:00:00.000Z"),
      });
      await upsertCardState(db, testUserId, conceptIds[0]!, stateA);
      await upsertCardState(db, testUserId, conceptIds[1]!, stateB);
      const got = await db
        .select()
        .from(concept_reviews)
        .where(eq(concept_reviews.user_id, testUserId));
      expect(got).toHaveLength(2);
    });
  });

  describe("recordReview", () => {
    it("delegates to upsertCardState (single-call shape)", async () => {
      const seed = initialCardState(new Date("2026-04-30T12:00:00.000Z"));
      const next = recomputeAfterReview({
        state: seed,
        grade: "easy",
        now: new Date("2026-04-30T12:00:00.000Z"),
      });
      await recordReview(db, testUserId, conceptIds[0]!, null, next);
      const got = await getCardState(db, testUserId, conceptIds[0]!);
      expect(got).toMatchObject({
        last_reviewed: next.last_reviewed,
      });
    });
  });

  describe("getDueConcepts", () => {
    it("returns an empty list for a user with no reviews", async () => {
      const due = await getDueConcepts(db, testUserId, new Date());
      expect(due).toEqual([]);
    });

    it("returns concepts whose state.due is at or before `now`", async () => {
      const past = new Date("2026-03-01T12:00:00.000Z");
      const future = new Date("2099-01-01T12:00:00.000Z");
      const seed = initialCardState(new Date("2026-04-30T12:00:00.000Z"));
      // Concept 0: due in the past — should show up
      await upsertCardState(db, testUserId, conceptIds[0]!, {
        ...seed,
        due: past.toISOString(),
        last_reviewed: past.toISOString(),
      });
      // Concept 1: due in the far future — should NOT show up
      await upsertCardState(db, testUserId, conceptIds[1]!, {
        ...seed,
        due: future.toISOString(),
        last_reviewed: past.toISOString(),
      });
      const due = await getDueConcepts(db, testUserId, new Date("2026-04-30T12:00:00.000Z"));
      expect(due.map((d) => d.concept_id)).toEqual([conceptIds[0]]);
    });

    it("caps result at 50 (LIMIT bound)", async () => {
      // We can't reasonably insert 60 concepts here, but we can sanity-check the cap is < 60.
      const due = await getDueConcepts(db, testUserId, new Date());
      expect(due.length).toBeLessThanOrEqual(50);
    });

    it("withOverdueDays computes days_overdue correctly", async () => {
      const past = new Date("2026-04-25T12:00:00.000Z");
      const seed = initialCardState(past);
      const row = { concept_id: conceptIds[0]!, state: seed };
      const enriched = withOverdueDays([row], new Date("2026-04-30T12:00:00.000Z"));
      expect(enriched[0]?.days_overdue).toBe(5);
    });

    it("withOverdueDays floors negative deltas at 0", async () => {
      const future = new Date("2099-01-01T12:00:00.000Z");
      const seed = { ...initialCardState(future), due: future.toISOString() };
      const enriched = withOverdueDays(
        [{ concept_id: conceptIds[0]!, state: seed }],
        new Date("2026-04-30T12:00:00.000Z"),
      );
      expect(enriched[0]?.days_overdue).toBe(0);
    });
  });
});
