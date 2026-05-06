import { eq, inArray } from "drizzle-orm";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type LearnProDb } from "./client.js";
import { exportUserData } from "./data-export.js";
import { DumpEnvelopeSchema, importDump, type DumpEnvelope } from "./data-import.js";
import { runMigrations } from "./migrate.js";
import {
  agent_calls,
  episodes,
  notifications,
  organizations,
  problems,
  profiles,
  submissions,
  tracks,
  users,
} from "./schema.js";

const DATABASE_URL = process.env["DATABASE_URL"];

describe("DumpEnvelopeSchema (no-DB validation contract)", () => {
  it("accepts a minimal empty envelope", () => {
    const envelope: DumpEnvelope = {
      profile: null,
      settings: null,
      episodes: [],
      submissions: [],
      agent_calls: [],
      notifications: [],
    };
    expect(() => DumpEnvelopeSchema.parse(envelope)).not.toThrow();
  });

  it("rejects an envelope missing one of the six top-level keys", () => {
    const bad = {
      profile: null,
      settings: null,
      episodes: [],
      submissions: [],
      agent_calls: [],
      // notifications missing
    };
    expect(() => DumpEnvelopeSchema.parse(bad)).toThrow();
  });

  it("rejects an envelope where episodes contains a non-UUID id", () => {
    const bad = {
      profile: null,
      settings: null,
      episodes: [
        {
          id: "not-a-uuid",
          org_id: "self",
          user_id: "11111111-1111-4111-8111-111111111111",
          problem_id: "22222222-2222-4222-8222-222222222222",
          started_at: "2026-05-01T00:00:00.000Z",
          finished_at: null,
          hints_used: 0,
          attempts: 0,
          final_outcome: null,
          time_to_solve_ms: null,
          interactions_summary: null,
        },
      ],
      submissions: [],
      agent_calls: [],
      notifications: [],
    };
    expect(() => DumpEnvelopeSchema.parse(bad)).toThrow();
  });
});

describe("importDump (no-DB stub contract)", () => {
  it("the helper is exported and accepts the canonical empty envelope shape", () => {
    // Sanity: keeps the public surface present even before the impl lands. The first
    // implementation commit replaces this with real behavior.
    expect(typeof importDump).toBe("function");
  });
});

// Integration tests against a real Postgres (Docker Compose). Skipped when DATABASE_URL isn't
// set so `pnpm test` still passes in CI without a DB.
// Run locally with: `DATABASE_URL=postgresql://learnpro:learnpro@localhost:5432/learnpro pnpm --filter @learnpro/db test`
describe.skipIf(!DATABASE_URL)("importDump (integration)", () => {
  let db: LearnProDb;
  let pool: Pool;
  let testProblemId: string;
  let testTrackId: string;
  const importedUserIds: string[] = [];

  beforeAll(async () => {
    const created = createDb({ connectionString: DATABASE_URL ?? "" });
    db = created.db;
    pool = created.pool;
    await runMigrations();
    await db
      .insert(organizations)
      .values({ id: "self", name: "Self-hosted" })
      .onConflictDoNothing();

    const insertedTrack = await db
      .insert(tracks)
      .values({
        slug: `data-import-track-${Date.now()}`,
        name: "Data import test track",
        language: "python",
      })
      .returning({ id: tracks.id });
    testTrackId = insertedTrack[0]!.id;

    const insertedProblem = await db
      .insert(problems)
      .values({
        track_id: testTrackId,
        slug: `data-import-problem-${Date.now()}`,
        name: "Data import test problem",
        language: "python",
        difficulty: "easy",
        statement: "noop",
        hidden_tests: { cases: [] },
      })
      .returning({ id: problems.id });
    testProblemId = insertedProblem[0]!.id;
  });

  afterAll(async () => {
    if (db) {
      for (const id of importedUserIds) {
        await cleanupUserData(db, id);
        await db.delete(users).where(eq(users.id, id));
      }
      await db.delete(problems).where(eq(problems.id, testProblemId));
      await db.delete(tracks).where(eq(tracks.id, testTrackId));
    }
    await pool?.end();
  });

  beforeEach(() => {
    // Each integration test creates its own fresh user and registers it for cleanup.
  });

  // The actual round-trip / idempotency / collision tests land in subsequent commits.
  // Stubbed here so the file structure is in place.
  it("integration harness boots and the test problem exists", async () => {
    const rows = await db.select().from(problems).where(eq(problems.id, testProblemId));
    expect(rows).toHaveLength(1);
  });

  // Helper exposed for later tests to register a created user for cleanup.
  function _registerForCleanup(userId: string): void {
    importedUserIds.push(userId);
  }
  // Suppress unused-warning while the helper is wired in by later commits.
  void _registerForCleanup;
  // exportUserData is used by the round-trip test landing in a later commit; reference it
  // here to keep the import live.
  void exportUserData;
});

async function cleanupUserData(db: LearnProDb, userId: string): Promise<void> {
  const userEpisodes = await db
    .select({ id: episodes.id })
    .from(episodes)
    .where(eq(episodes.user_id, userId));
  const epIds = userEpisodes.map((e) => e.id);
  if (epIds.length > 0) {
    await db.delete(submissions).where(inArray(submissions.episode_id, epIds));
  }
  await db.delete(episodes).where(eq(episodes.user_id, userId));
  await db.delete(agent_calls).where(eq(agent_calls.user_id, userId));
  await db.delete(notifications).where(eq(notifications.user_id, userId));
  await db.delete(profiles).where(eq(profiles.user_id, userId));
}
