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

describe("importDump (no-DB validation)", () => {
  it("the helper is exported", () => {
    expect(typeof importDump).toBe("function");
  });

  it("rejects an envelope that fails Zod validation before touching the DB", async () => {
    // No DB call should fire — the parse error throws synchronously inside the helper.
    const fakeDb = {
      transaction: async () => {
        throw new Error("DB should not be touched on validation failure");
      },
    } as unknown as LearnProDb;
    await expect(importDump(fakeDb, { not: "an envelope" })).rejects.toThrow();
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

  it("integration harness boots and the test problem exists", async () => {
    const rows = await db.select().from(problems).where(eq(problems.id, testProblemId));
    expect(rows).toHaveLength(1);
  });

  it("creates the user row when it doesn't exist", async () => {
    const newUserId = randomUuid();
    importedUserIds.push(newUserId);
    const dump = makeMinimalDump({ user_id: newUserId });

    const result = await importDump(db, dump);

    expect(result.user_created).toBe(true);
    const inserted = await db.select().from(users).where(eq(users.id, newUserId));
    expect(inserted).toHaveLength(1);
    expect(inserted[0]!.email).toBe(dump.profile!.email);
    expect(inserted[0]!.xp).toBe(dump.profile!.xp);
  });

  it("preserves existing user identity columns when the user already exists", async () => {
    const newUserId = randomUuid();
    importedUserIds.push(newUserId);
    await db.insert(users).values({
      id: newUserId,
      email: `existing-${Date.now()}@learnpro.local`,
      name: "Original",
    });

    const logs: string[] = [];
    const dump = makeMinimalDump({ user_id: newUserId, name: "Replaced" });
    const result = await importDump(db, dump, { logger: (l) => logs.push(l) });

    expect(result.user_created).toBe(false);
    const row = await db.select().from(users).where(eq(users.id, newUserId));
    expect(row[0]!.name).toBe("Original");
    expect(logs.some((l) => l.includes("already exists"))).toBe(true);
  });

  it("UPSERTs the profile row (insert path)", async () => {
    const newUserId = randomUuid();
    importedUserIds.push(newUserId);
    const dump = makeMinimalDump({ user_id: newUserId });
    dump.profile!.profile = {
      target_role: "swe_intern",
      time_budget_min: 30,
      primary_goal: "land internship",
      self_assessed_level: "beginner",
      language_comfort: { python: "comfortable" },
      updated_at: new Date("2026-04-01T00:00:00.000Z").toISOString(),
    };

    const result = await importDump(db, dump);

    expect(result.inserted.profiles).toBe(1);
    const row = await db.select().from(profiles).where(eq(profiles.user_id, newUserId));
    expect(row[0]!.target_role).toBe("swe_intern");
    expect(row[0]!.time_budget_min).toBe(30);
    expect(row[0]!.language_comfort).toEqual({ python: "comfortable" });
  });

  it("UPSERTs the profile row (update path) — second import overwrites tunable fields", async () => {
    const newUserId = randomUuid();
    importedUserIds.push(newUserId);
    await db.insert(users).values({
      id: newUserId,
      email: `prof-update-${Date.now()}@learnpro.local`,
    });
    await db.insert(profiles).values({
      user_id: newUserId,
      target_role: "OLD",
      time_budget_min: 5,
    });

    const dump = makeMinimalDump({ user_id: newUserId });
    dump.profile!.profile = {
      target_role: "NEW",
      time_budget_min: 60,
      primary_goal: null,
      self_assessed_level: null,
      language_comfort: null,
      updated_at: new Date("2026-04-15T00:00:00.000Z").toISOString(),
    };

    await importDump(db, dump);

    const row = await db.select().from(profiles).where(eq(profiles.user_id, newUserId));
    expect(row[0]!.target_role).toBe("NEW");
    expect(row[0]!.time_budget_min).toBe(60);
  });

  it("does nothing when dump.profile is null", async () => {
    const logs: string[] = [];
    const dump: DumpEnvelope = {
      profile: null,
      settings: null,
      episodes: [],
      submissions: [],
      agent_calls: [],
      notifications: [],
    };
    const result = await importDump(db, dump, { logger: (l) => logs.push(l) });
    expect(result.user_created).toBe(false);
    expect(result.inserted.profiles).toBe(0);
    expect(logs.some((l) => l.includes("dump.profile is null"))).toBe(true);
  });

  // exportUserData is used by the round-trip test landing in a later commit; reference it
  // here to keep the import live.
  void exportUserData;
});

// =============================================================================
// Stub-data factories for the integration tests above.
// =============================================================================

function randomUuid(): string {
  return crypto.randomUUID();
}

function makeMinimalDump(overrides: { user_id: string; name?: string | null }): DumpEnvelope {
  const created = new Date("2026-04-01T00:00:00.000Z").toISOString();
  return {
    profile: {
      user_id: overrides.user_id,
      org_id: "self",
      email: `import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@learnpro.local`,
      name: overrides.name ?? null,
      image: null,
      emailVerified: null,
      created_at: created,
      xp: 42,
      streak_grace_days_remaining: 2,
      streak_grace_last_replenished_at: null,
      profile: null,
    },
    settings: null,
    episodes: [],
    submissions: [],
    agent_calls: [],
    notifications: [],
  };
}

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
