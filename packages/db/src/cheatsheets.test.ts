import { eq } from "drizzle-orm";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type LearnProDb } from "./client.js";
import { runMigrations } from "./migrate.js";
import {
  CheatsheetEntriesSchema,
  CheatsheetEntrySchema,
  CheatsheetEpisodesCoveredSchema,
  createCheatsheet,
  findCheatsheetForEpisodes,
  getCheatsheetForUser,
  listCheatsheetsForUser,
  updateCheatsheetMarkdown,
} from "./cheatsheets.js";
import {
  cheatsheets,
  episodes,
  organizations,
  problems,
  tracks,
  users,
} from "./schema.js";

const DATABASE_URL = process.env["DATABASE_URL"];

// Pure schema tests run unconditionally; integration tests below are gated on DATABASE_URL.

describe("CheatsheetEntrySchema", () => {
  it("accepts a fully-filled entry", () => {
    const e = {
      concept: "List comprehensions",
      definition: "A concise way to build a new list from another iterable.",
      code_example: "[x*2 for x in nums if x > 0]",
      gotcha: "Side-effects in the comprehension still run on every iteration.",
    };
    expect(CheatsheetEntrySchema.parse(e)).toEqual(e);
  });

  it("rejects empty fields", () => {
    expect(() =>
      CheatsheetEntrySchema.parse({
        concept: "",
        definition: "x",
        code_example: "x",
        gotcha: "x",
      }),
    ).toThrow();
  });

  it("rejects entries with overlong fields", () => {
    expect(() =>
      CheatsheetEntrySchema.parse({
        concept: "x".repeat(200),
        definition: "x",
        code_example: "x",
        gotcha: "x",
      }),
    ).toThrow();
  });
});

describe("CheatsheetEntriesSchema", () => {
  it("caps the array at 6 entries", () => {
    const e = {
      concept: "c",
      definition: "d",
      code_example: "x",
      gotcha: "g",
    };
    expect(CheatsheetEntriesSchema.parse(Array.from({ length: 6 }, () => e))).toHaveLength(6);
    expect(() => CheatsheetEntriesSchema.parse(Array.from({ length: 7 }, () => e))).toThrow();
  });

  it("accepts an empty array (best-effort fallback)", () => {
    expect(CheatsheetEntriesSchema.parse([])).toEqual([]);
  });
});

describe("CheatsheetEpisodesCoveredSchema", () => {
  it("requires at least one episode UUID", () => {
    expect(() => CheatsheetEpisodesCoveredSchema.parse([])).toThrow();
  });

  it("rejects non-UUID strings", () => {
    expect(() => CheatsheetEpisodesCoveredSchema.parse(["not-a-uuid"])).toThrow();
  });

  it("accepts a list of UUIDs", () => {
    const ids = [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    ];
    expect(CheatsheetEpisodesCoveredSchema.parse(ids)).toEqual(ids);
  });
});

// Integration tests against a real Postgres. Skipped when DATABASE_URL is unset.
describe.skipIf(!DATABASE_URL)("cheatsheets (integration)", () => {
  let db: LearnProDb;
  let pool: Pool;
  let testUserId: string;
  let trackId: string;
  let problemId: string;
  let episode1Id: string;
  let episode2Id: string;

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
      .values({ email: `cheatsheets-test-${Date.now()}@learnpro.local` })
      .returning({ id: users.id });
    testUserId = insertedUser[0]!.id;

    const insertedTrack = await db
      .insert(tracks)
      .values({
        slug: `cheatsheet-test-track-${Date.now()}`,
        name: "Cheatsheet Test Track",
        language: "python",
      })
      .returning({ id: tracks.id });
    trackId = insertedTrack[0]!.id;

    const insertedProblem = await db
      .insert(problems)
      .values({
        track_id: trackId,
        slug: `cheatsheet-test-problem-${Date.now()}`,
        name: "Cheatsheet Test Problem",
        language: "python",
        difficulty: "easy",
        statement: "test",
        hidden_tests: [{ input: [], expected: 0 }],
      })
      .returning({ id: problems.id });
    problemId = insertedProblem[0]!.id;

    const insertedEpisode1 = await db
      .insert(episodes)
      .values({ user_id: testUserId, problem_id: problemId })
      .returning({ id: episodes.id });
    episode1Id = insertedEpisode1[0]!.id;

    const insertedEpisode2 = await db
      .insert(episodes)
      .values({ user_id: testUserId, problem_id: problemId })
      .returning({ id: episodes.id });
    episode2Id = insertedEpisode2[0]!.id;
  });

  afterAll(async () => {
    if (db) {
      await db.delete(cheatsheets).where(eq(cheatsheets.user_id, testUserId));
      await db.delete(episodes).where(eq(episodes.user_id, testUserId));
      await db.delete(problems).where(eq(problems.id, problemId));
      await db.delete(tracks).where(eq(tracks.id, trackId));
      await db.delete(users).where(eq(users.id, testUserId));
    }
    await pool?.end();
  });

  beforeEach(async () => {
    await db.delete(cheatsheets).where(eq(cheatsheets.user_id, testUserId));
  });

  const baseEntry = {
    concept: "List comprehensions",
    definition: "A concise way to build a new list.",
    code_example: "[x*2 for x in nums]",
    gotcha: "Don't shadow the loop variable outside.",
  };

  it("createCheatsheet inserts a row and returns the parsed view", async () => {
    const view = await createCheatsheet(db, {
      user_id: testUserId,
      episodes_covered: [episode1Id, episode2Id],
      entries: [baseEntry],
      markdown_content: "# notes",
    });
    expect(view.user_id).toBe(testUserId);
    expect(view.entries).toHaveLength(1);
    expect(view.episodes_covered).toEqual([episode1Id, episode2Id]);
    expect(view.markdown_content).toBe("# notes");
  });

  it("listCheatsheetsForUser returns most recent first, paginated", async () => {
    const earlier = await createCheatsheet(db, {
      user_id: testUserId,
      episodes_covered: [episode1Id],
      entries: [baseEntry],
      markdown_content: "earlier",
      now: new Date(Date.now() - 60_000),
    });
    const later = await createCheatsheet(db, {
      user_id: testUserId,
      episodes_covered: [episode2Id],
      entries: [baseEntry],
      markdown_content: "later",
    });

    const page = await listCheatsheetsForUser(db, { user_id: testUserId });
    expect(page).toHaveLength(2);
    expect(page[0]!.id).toBe(later.id);
    expect(page[1]!.id).toBe(earlier.id);

    const onlyOne = await listCheatsheetsForUser(db, { user_id: testUserId, limit: 1 });
    expect(onlyOne).toHaveLength(1);
    expect(onlyOne[0]!.id).toBe(later.id);

    const second = await listCheatsheetsForUser(db, { user_id: testUserId, limit: 1, offset: 1 });
    expect(second[0]!.id).toBe(earlier.id);
  });

  it("getCheatsheetForUser returns null when the cheatsheet doesn't belong to the user", async () => {
    const created = await createCheatsheet(db, {
      user_id: testUserId,
      episodes_covered: [episode1Id],
      entries: [baseEntry],
      markdown_content: "x",
    });
    const otherUser = await db
      .insert(users)
      .values({ email: `cheatsheets-other-${Date.now()}@learnpro.local` })
      .returning({ id: users.id });
    const otherId = otherUser[0]!.id;
    expect(await getCheatsheetForUser(db, created.id, otherId)).toBeNull();
    await db.delete(users).where(eq(users.id, otherId));
  });

  it("updateCheatsheetMarkdown updates the markdown but leaves entries intact", async () => {
    const created = await createCheatsheet(db, {
      user_id: testUserId,
      episodes_covered: [episode1Id],
      entries: [baseEntry],
      markdown_content: "v1",
    });
    const after = await updateCheatsheetMarkdown(db, {
      user_id: testUserId,
      cheatsheet_id: created.id,
      markdown_content: "v2-edited",
    });
    expect(after?.markdown_content).toBe("v2-edited");
    expect(after?.entries).toEqual(created.entries);
    expect(after!.updated_at.getTime()).toBeGreaterThanOrEqual(created.updated_at.getTime());
  });

  it("updateCheatsheetMarkdown returns null when the cheatsheet doesn't belong to the user", async () => {
    const created = await createCheatsheet(db, {
      user_id: testUserId,
      episodes_covered: [episode1Id],
      entries: [baseEntry],
      markdown_content: "v1",
    });
    const otherUser = await db
      .insert(users)
      .values({ email: `cheatsheets-other-${Date.now()}@learnpro.local` })
      .returning({ id: users.id });
    const otherId = otherUser[0]!.id;
    const after = await updateCheatsheetMarkdown(db, {
      user_id: otherId,
      cheatsheet_id: created.id,
      markdown_content: "stolen",
    });
    expect(after).toBeNull();
    await db.delete(users).where(eq(users.id, otherId));
  });

  it("findCheatsheetForEpisodes is order-insensitive on the episode list", async () => {
    const sorted = [episode1Id, episode2Id].sort();
    const created = await createCheatsheet(db, {
      user_id: testUserId,
      episodes_covered: sorted,
      entries: [baseEntry],
      markdown_content: "x",
    });
    const reversed = [...sorted].reverse();
    const found = await findCheatsheetForEpisodes(db, testUserId, reversed);
    expect(found?.id).toBe(created.id);
  });

  it("findCheatsheetForEpisodes returns null when no exact match exists", async () => {
    await createCheatsheet(db, {
      user_id: testUserId,
      episodes_covered: [episode1Id],
      entries: [baseEntry],
      markdown_content: "x",
    });
    expect(await findCheatsheetForEpisodes(db, testUserId, [episode2Id])).toBeNull();
  });
});
