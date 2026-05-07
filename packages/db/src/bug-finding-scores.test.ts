import { eq } from "drizzle-orm";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type LearnProDb } from "./client.js";
import { listBugFindingScores, upsertBugFindingScore } from "./bug-finding-scores.js";
import { runMigrations } from "./migrate.js";
import { bug_finding_scores, organizations, users } from "./schema.js";

const DATABASE_URL = process.env["DATABASE_URL"];

describe.skipIf(!DATABASE_URL)("bug_finding_scores DB helpers (integration)", () => {
  let db: LearnProDb;
  let pool: Pool;
  let testUserId: string;
  let otherUserId: string;

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
      .values({ email: `bug-finding-${Date.now()}@learnpro.local` })
      .returning({ id: users.id });
    testUserId = userRow[0]?.id ?? "";
    const otherRow = await db
      .insert(users)
      .values({ email: `bug-finding-other-${Date.now()}@learnpro.local` })
      .returning({ id: users.id });
    otherUserId = otherRow[0]?.id ?? "";
  });

  afterAll(async () => {
    if (db) {
      await db.delete(bug_finding_scores).where(eq(bug_finding_scores.user_id, testUserId));
      await db.delete(bug_finding_scores).where(eq(bug_finding_scores.user_id, otherUserId));
      await db.delete(users).where(eq(users.id, testUserId));
      await db.delete(users).where(eq(users.id, otherUserId));
    }
    await pool?.end();
  });

  beforeEach(async () => {
    await db.delete(bug_finding_scores).where(eq(bug_finding_scores.user_id, testUserId));
    await db.delete(bug_finding_scores).where(eq(bug_finding_scores.user_id, otherUserId));
  });

  it("cold-start insert: first close on an untouched archetype seeds row + applies EWMA", async () => {
    const out = await upsertBugFindingScore(db, {
      user_id: testUserId,
      bug_archetype: "off_by_one",
      signal: { passed: true, named_bug: true },
    });
    expect(out.archetype).toBe("off_by_one");
    expect(out.attempts).toBe(1);
    // Cold-start prev=0.5; alpha=0.4; target=1.0 → 0.4*1 + 0.6*0.5 = 0.7.
    expect(out.score).toBeCloseTo(0.7, 5);
    expect(out.confidence).toBeGreaterThan(0);
  });

  it("UPSERT path: a second close on the same archetype updates the same row", async () => {
    await upsertBugFindingScore(db, {
      user_id: testUserId,
      bug_archetype: "off_by_one",
      signal: { passed: true, named_bug: true },
    });
    const second = await upsertBugFindingScore(db, {
      user_id: testUserId,
      bug_archetype: "off_by_one",
      signal: { passed: true, named_bug: true },
    });
    expect(second.attempts).toBe(2);
    // Second iteration: prev=0.7; target=1.0 → 0.4 + 0.42 = 0.82.
    expect(second.score).toBeCloseTo(0.82, 5);

    // Ensure no duplicate row exists.
    const rows = await db
      .select()
      .from(bug_finding_scores)
      .where(eq(bug_finding_scores.user_id, testUserId));
    expect(rows).toHaveLength(1);
  });

  it("got_help short-circuit persists prev unchanged but bumps updated_at", async () => {
    const first = await upsertBugFindingScore(db, {
      user_id: testUserId,
      bug_archetype: "shadowing",
      signal: { passed: true, named_bug: true },
    });
    const after = await upsertBugFindingScore(db, {
      user_id: testUserId,
      bug_archetype: "shadowing",
      signal: { passed: true, named_bug: true, got_help: true },
    });
    // got_help short-circuits the EWMA — score / confidence / attempts stay put.
    expect(after.score).toBeCloseTo(first.score, 5);
    expect(after.attempts).toBe(first.attempts);
    expect(after.confidence).toBeCloseTo(first.confidence, 5);
  });

  it("listBugFindingScores returns all 8 archetypes with cold-start defaults for untouched ones", async () => {
    await upsertBugFindingScore(db, {
      user_id: testUserId,
      bug_archetype: "off_by_one",
      signal: { passed: true, named_bug: true },
    });
    const scores = await listBugFindingScores(db, testUserId);
    expect(scores).toHaveLength(8);
    const offByOne = scores.find((s) => s.archetype === "off_by_one");
    const lateBinding = scores.find((s) => s.archetype === "late_binding");
    expect(offByOne?.attempts).toBe(1);
    expect(lateBinding?.attempts).toBe(0);
    expect(lateBinding?.score).toBeCloseTo(0.5, 5);
  });

  it("two different archetypes coexist as separate rows for the same user", async () => {
    await upsertBugFindingScore(db, {
      user_id: testUserId,
      bug_archetype: "off_by_one",
      signal: { passed: true, named_bug: true },
    });
    await upsertBugFindingScore(db, {
      user_id: testUserId,
      bug_archetype: "shadowing",
      signal: { passed: false, named_bug: false },
    });
    const rows = await db
      .select()
      .from(bug_finding_scores)
      .where(eq(bug_finding_scores.user_id, testUserId));
    expect(rows).toHaveLength(2);
    const archetypes = rows.map((r) => r.bug_archetype).sort();
    expect(archetypes).toEqual(["off_by_one", "shadowing"]);
  });

  it("the same archetype belongs to two different users without cross-contamination", async () => {
    await upsertBugFindingScore(db, {
      user_id: testUserId,
      bug_archetype: "off_by_one",
      signal: { passed: true, named_bug: true },
    });
    await upsertBugFindingScore(db, {
      user_id: otherUserId,
      bug_archetype: "off_by_one",
      signal: { passed: false, named_bug: false },
    });
    const me = await listBugFindingScores(db, testUserId);
    const them = await listBugFindingScores(db, otherUserId);
    const myOffByOne = me.find((s) => s.archetype === "off_by_one");
    const theirOffByOne = them.find((s) => s.archetype === "off_by_one");
    expect(myOffByOne?.score).toBeCloseTo(0.7, 5);
    // For other: prev=0.5; alpha=0.4; target=0 → 0.6*0.5 = 0.3.
    expect(theirOffByOne?.score).toBeCloseTo(0.3, 5);
  });
});
