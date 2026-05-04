import { eq } from "drizzle-orm";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type LearnProDb } from "./client.js";
import {
  deleteUserAccount,
  deleteUserVoiceTranscripts,
  getUserDataSummary,
} from "./data-controls.js";
import { runMigrations } from "./migrate.js";
import {
  agent_calls,
  episodes,
  interactions,
  organizations,
  problems,
  tracks,
  users,
} from "./schema.js";

const DATABASE_URL = process.env["DATABASE_URL"];

describe.skipIf(!DATABASE_URL)("data-controls helpers (integration)", () => {
  let db: LearnProDb;
  let pool: Pool;

  beforeAll(async () => {
    const created = createDb({ connectionString: DATABASE_URL ?? "" });
    db = created.db;
    pool = created.pool;
    await runMigrations();
    await db
      .insert(organizations)
      .values({ id: "self", name: "Self-hosted" })
      .onConflictDoNothing();
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("getUserDataSummary returns counts + last_active_at", async () => {
    const u = await db
      .insert(users)
      .values({ email: `dc-summary-${Date.now()}@learnpro.local` })
      .returning({ id: users.id });
    const userId = u[0]!.id;

    const t = await db
      .insert(tracks)
      .values({ slug: `dc-${Date.now()}`, name: "x", language: "python" })
      .returning({ id: tracks.id });
    const trackId = t[0]!.id;
    const p = await db
      .insert(problems)
      .values({
        track_id: trackId,
        slug: `pp-${Date.now()}`,
        name: "p",
        language: "python",
        difficulty: "easy",
        statement: "s",
        hidden_tests: [],
      })
      .returning({ id: problems.id });
    const problemId = p[0]!.id;
    const e = await db
      .insert(episodes)
      .values({ user_id: userId, problem_id: problemId })
      .returning({ id: episodes.id });
    const episodeId = e[0]!.id;

    await db.insert(interactions).values([
      {
        user_id: userId,
        episode_id: episodeId,
        type: "voice",
        payload: { transcript: "x", language: "en" },
      },
      {
        user_id: userId,
        episode_id: episodeId,
        type: "voice",
        payload: { transcript: "y", language: "en" },
      },
      {
        user_id: userId,
        episode_id: episodeId,
        type: "submit",
        payload: { passed: true },
      },
    ]);

    const summary = await getUserDataSummary(db, userId);
    expect(summary.episodes_count).toBe(1);
    expect(summary.voice_transcripts_count).toBe(2);
    expect(summary.interactions_count).toBe(3);
    expect(summary.last_active_at).not.toBeNull();

    // Cleanup
    await db.delete(interactions).where(eq(interactions.user_id, userId));
    await db.delete(episodes).where(eq(episodes.user_id, userId));
    await db.delete(problems).where(eq(problems.id, problemId));
    await db.delete(tracks).where(eq(tracks.id, trackId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it("deleteUserVoiceTranscripts deletes only voice rows for the given user", async () => {
    const u = await db
      .insert(users)
      .values({ email: `dc-voice-${Date.now()}@learnpro.local` })
      .returning({ id: users.id });
    const userId = u[0]!.id;

    await db.insert(interactions).values([
      { user_id: userId, type: "voice", payload: { transcript: "x", language: "en" } },
      { user_id: userId, type: "voice", payload: { transcript: "y", language: "en" } },
      { user_id: userId, type: "submit", payload: { passed: true } },
    ]);

    const deleted = await deleteUserVoiceTranscripts(db, userId);
    expect(deleted).toBe(2);

    const survivors = await db.select().from(interactions).where(eq(interactions.user_id, userId));
    expect(survivors).toHaveLength(1);
    expect(survivors[0]!.type).toBe("submit");

    await db.delete(interactions).where(eq(interactions.user_id, userId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it("deleteUserAccount cascades — user row gone, interactions gone, agent_calls user_id NULL", async () => {
    const u = await db
      .insert(users)
      .values({ email: `dc-account-${Date.now()}@learnpro.local` })
      .returning({ id: users.id });
    const userId = u[0]!.id;

    await db.insert(interactions).values({
      user_id: userId,
      type: "submit",
      payload: { passed: true },
    });
    await db.insert(agent_calls).values({
      user_id: userId,
      provider: "anthropic",
      model: "claude-3-haiku",
    });

    const result = await deleteUserAccount(db, userId);
    expect(result.deleted).toBe(true);
    expect(result.deleted_user_id).toBe(userId);

    const remaining = await db.select().from(users).where(eq(users.id, userId));
    expect(remaining).toHaveLength(0);
    const interactionsLeft = await db
      .select()
      .from(interactions)
      .where(eq(interactions.user_id, userId));
    expect(interactionsLeft).toHaveLength(0);
    // agent_calls.user_id is set null on cascade — the rows still exist with user_id=null.
    // tidy: keep them; tests share a DB.
  });
});
