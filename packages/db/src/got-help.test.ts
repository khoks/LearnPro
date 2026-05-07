import { eq } from "drizzle-orm";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type LearnProDb } from "./client.js";
import { countGotHelpEpisodes, getEpisodeGotHelp, markEpisodeGotHelp } from "./got-help.js";
import { runMigrations } from "./migrate.js";
import { episodes, organizations, problems, tracks, users } from "./schema.js";

const DATABASE_URL = process.env["DATABASE_URL"];

describe.skipIf(!DATABASE_URL)("got-help DB helpers (integration)", () => {
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
      .values({ email: `got-help-test-${Date.now()}@learnpro.local` })
      .returning({ id: users.id });
    testUserId = userRow[0]?.id ?? "";
    const otherRow = await db
      .insert(users)
      .values({ email: `got-help-other-${Date.now()}@learnpro.local` })
      .returning({ id: users.id });
    otherUserId = otherRow[0]?.id ?? "";
    const trackRow = await db
      .insert(tracks)
      .values({
        slug: `got-help-track-${Date.now()}`,
        name: "Got Help Test Track",
        language: "python",
      })
      .returning({ id: tracks.id });
    trackId = trackRow[0]?.id ?? "";
    const problemRow = await db
      .insert(problems)
      .values({
        track_id: trackId,
        slug: "got-help-test-problem",
        name: "Got Help Test Problem",
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
      await db.delete(episodes).where(eq(episodes.user_id, otherUserId));
      await db.delete(problems).where(eq(problems.id, problemId));
      await db.delete(tracks).where(eq(tracks.id, trackId));
      await db.delete(users).where(eq(users.id, testUserId));
      await db.delete(users).where(eq(users.id, otherUserId));
    }
    await pool?.end();
  });

  beforeEach(async () => {
    await db.delete(episodes).where(eq(episodes.user_id, testUserId));
    await db.delete(episodes).where(eq(episodes.user_id, otherUserId));
  });

  it("default got_help is false on a fresh episode", async () => {
    const ep = await db
      .insert(episodes)
      .values({ user_id: testUserId, problem_id: problemId, org_id: "self" })
      .returning({ id: episodes.id });
    const id = ep[0]?.id ?? "";
    const v = await getEpisodeGotHelp(db, id);
    expect(v).toBe(false);
  });

  it("markEpisodeGotHelp flips the flag for the matching (user, episode)", async () => {
    const ep = await db
      .insert(episodes)
      .values({ user_id: testUserId, problem_id: problemId, org_id: "self" })
      .returning({ id: episodes.id });
    const id = ep[0]?.id ?? "";
    const r = await markEpisodeGotHelp(db, {
      user_id: testUserId,
      episode_id: id,
      got_help: true,
    });
    expect(r.updated).toBe(true);
    const v = await getEpisodeGotHelp(db, id);
    expect(v).toBe(true);
  });

  it("markEpisodeGotHelp refuses to write across users (defense-in-depth)", async () => {
    const ep = await db
      .insert(episodes)
      .values({ user_id: testUserId, problem_id: problemId, org_id: "self" })
      .returning({ id: episodes.id });
    const id = ep[0]?.id ?? "";
    const r = await markEpisodeGotHelp(db, {
      user_id: otherUserId,
      episode_id: id,
      got_help: true,
    });
    expect(r.updated).toBe(false);
    const v = await getEpisodeGotHelp(db, id);
    expect(v).toBe(false);
  });

  it("countGotHelpEpisodes returns the count of true rows for the user", async () => {
    await db.insert(episodes).values([
      { user_id: testUserId, problem_id: problemId, org_id: "self", got_help: true },
      { user_id: testUserId, problem_id: problemId, org_id: "self", got_help: true },
      { user_id: testUserId, problem_id: problemId, org_id: "self", got_help: false },
      { user_id: otherUserId, problem_id: problemId, org_id: "self", got_help: true },
    ]);
    const n = await countGotHelpEpisodes(db, testUserId);
    expect(n).toBe(2);
  });

  it("getEpisodeGotHelp returns null when the episode doesn't exist", async () => {
    const v = await getEpisodeGotHelp(db, "00000000-0000-4000-8000-000000000000");
    expect(v).toBeNull();
  });
});
