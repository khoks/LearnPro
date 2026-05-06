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

  it("inserts episodes / submissions / agent_calls / notifications preserving original UUIDs", async () => {
    const newUserId = randomUuid();
    importedUserIds.push(newUserId);
    const epId = randomUuid();
    const subId = randomUuid();
    const callId = randomUuid();
    const notifId = randomUuid();
    const dump = makeMinimalDump({ user_id: newUserId });
    dump.episodes = [
      {
        id: epId,
        org_id: "self",
        user_id: newUserId,
        problem_id: testProblemId,
        started_at: new Date("2026-04-20T10:00:00.000Z").toISOString(),
        finished_at: new Date("2026-04-20T10:05:00.000Z").toISOString(),
        hints_used: 1,
        attempts: 2,
        final_outcome: "passed_with_hints",
        time_to_solve_ms: 300_000,
        interactions_summary: { runs: 3, hints: 1 },
      },
    ];
    dump.submissions = [
      {
        id: subId,
        org_id: "self",
        episode_id: epId,
        submitted_at: new Date("2026-04-20T10:04:00.000Z").toISOString(),
        code: "print('hi')",
        passed: true,
        runtime_ms: 12,
      },
    ];
    dump.agent_calls = [
      {
        id: callId,
        org_id: "self",
        user_id: newUserId,
        session_id: "sess-1",
        episode_id: epId,
        provider: "anthropic",
        model: "claude-haiku",
        role: "tutor",
        task: "complete",
        prompt_version: "v1",
        input_tokens: 100,
        output_tokens: 50,
        cached_tokens: 0,
        cost_usd: "0.00010000",
        pricing_version: "2026-04-01",
        tool_used: "give-hint",
        latency_ms: 450,
        ok: true,
        called_at: new Date("2026-04-20T10:02:00.000Z").toISOString(),
      },
    ];
    dump.notifications = [
      {
        id: notifId,
        org_id: "self",
        user_id: newUserId,
        channel: "in_app",
        title: "Welcome",
        body: "Glad to have you.",
        sent_at: new Date("2026-04-20T08:00:00.000Z").toISOString(),
        read_at: null,
        dedupe_key: null,
      },
    ];

    const result = await importDump(db, dump);

    expect(result.inserted.episodes).toBe(1);
    expect(result.inserted.submissions).toBe(1);
    expect(result.inserted.agent_calls).toBe(1);
    expect(result.inserted.notifications).toBe(1);

    const epRow = await db.select().from(episodes).where(eq(episodes.id, epId));
    expect(epRow[0]!.user_id).toBe(newUserId);
    expect(epRow[0]!.problem_id).toBe(testProblemId);
    expect(epRow[0]!.final_outcome).toBe("passed_with_hints");
    expect(epRow[0]!.embedding).toBeNull(); // intentionally omitted

    const subRow = await db.select().from(submissions).where(eq(submissions.id, subId));
    expect(subRow[0]!.episode_id).toBe(epId);
    expect(subRow[0]!.code).toBe("print('hi')");

    const callRow = await db.select().from(agent_calls).where(eq(agent_calls.id, callId));
    expect(callRow[0]!.user_id).toBe(newUserId);
    expect(callRow[0]!.episode_id).toBe(epId);

    const notifRow = await db.select().from(notifications).where(eq(notifications.id, notifId));
    expect(notifRow[0]!.user_id).toBe(newUserId);
    expect(notifRow[0]!.title).toBe("Welcome");
  });

  it("fails fast with a clear error when a referenced problem_id is missing", async () => {
    const newUserId = randomUuid();
    importedUserIds.push(newUserId);
    const missingProblemId = randomUuid();
    const dump = makeMinimalDump({ user_id: newUserId });
    dump.episodes = [
      {
        id: randomUuid(),
        org_id: "self",
        user_id: newUserId,
        problem_id: missingProblemId,
        started_at: new Date().toISOString(),
        finished_at: null,
        hints_used: 0,
        attempts: 0,
        final_outcome: null,
        time_to_solve_ms: null,
        interactions_summary: null,
      },
    ];
    await expect(importDump(db, dump)).rejects.toThrow(/missing.*problem_id/);
    // The transaction rolled back — the user row should NOT exist.
    const userExists = await db.select().from(users).where(eq(users.id, newUserId));
    expect(userExists).toHaveLength(0);
  });

  it("round-trips: exportUserData() on a fully-populated user → importDump() preserves row counts", async () => {
    // Setup: build a fully-populated user, export, then import the dump under a fresh user_id.
    // To simulate a fresh target DB on the same physical Postgres, we remap every UUID in the
    // dump (user_id + episode_id + submission_id + agent_call_id + notification_id) so the
    // import doesn't collide with the source rows.
    const sourceUserId = randomUuid();
    importedUserIds.push(sourceUserId);
    await db.insert(users).values({
      id: sourceUserId,
      email: `roundtrip-source-${Date.now()}@learnpro.local`,
    });
    await db.insert(profiles).values({
      user_id: sourceUserId,
      target_role: "swe_intern",
      time_budget_min: 30,
      primary_goal: "land internship",
      self_assessed_level: "beginner",
      language_comfort: { python: "comfortable" },
    });
    const ep = await db
      .insert(episodes)
      .values({
        user_id: sourceUserId,
        problem_id: testProblemId,
        attempts: 2,
        hints_used: 1,
        final_outcome: "passed",
      })
      .returning({ id: episodes.id });
    await db.insert(submissions).values([
      { episode_id: ep[0]!.id, code: "x=1", passed: false, runtime_ms: 5 },
      { episode_id: ep[0]!.id, code: "x=2", passed: true, runtime_ms: 6 },
    ]);
    await db.insert(agent_calls).values({
      user_id: sourceUserId,
      provider: "anthropic",
      model: "claude-haiku",
      input_tokens: 50,
      output_tokens: 20,
    });
    await db.insert(notifications).values({
      user_id: sourceUserId,
      channel: "in_app",
      title: "Round-trip test",
    });

    // Export to JSON.
    const chunks: string[] = [];
    await exportUserData({
      db,
      user_id: sourceUserId,
      write: (c) => chunks.push(c),
    });
    const dump = JSON.parse(chunks.join("")) as unknown;

    // Remap every row UUID + the email to fresh values so this import doesn't collide with
    // the source rows. (Production migration use cases land on a fresh DB and don't need this
    // step; the test simulates a fresh DB by rewriting.)
    const targetUserId = randomUuid();
    importedUserIds.push(targetUserId);
    const targetEmail = `roundtrip-target-${Date.now()}@learnpro.local`;
    let remapped = remapUserId(dump, sourceUserId, targetUserId);
    remapped = remapEmail(
      remapped,
      (remapped as { profile: { email: string } }).profile.email,
      targetEmail,
    );
    remapped = remapAllRowIds(remapped);

    const result = await importDump(db, remapped);

    expect(result.user_created).toBe(true);
    expect(result.inserted.profiles).toBe(1);
    expect(result.inserted.episodes).toBe(1);
    expect(result.inserted.submissions).toBe(2);
    expect(result.inserted.agent_calls).toBe(1);
    expect(result.inserted.notifications).toBe(1);

    // Spot-check: counts match between source and target.
    const tgtEps = await db.select().from(episodes).where(eq(episodes.user_id, targetUserId));
    expect(tgtEps).toHaveLength(1);
    const tgtSubs = await db
      .select()
      .from(submissions)
      .where(inArray(submissions.episode_id, tgtEps.map((e) => e.id)));
    expect(tgtSubs).toHaveLength(2);
  });

  it("is idempotent — running the same dump twice doesn't double-insert", async () => {
    const newUserId = randomUuid();
    importedUserIds.push(newUserId);
    const epId = randomUuid();
    const subId = randomUuid();
    const callId = randomUuid();
    const notifId = randomUuid();
    const dump = makeMinimalDump({ user_id: newUserId });
    dump.episodes = [
      {
        id: epId,
        org_id: "self",
        user_id: newUserId,
        problem_id: testProblemId,
        started_at: new Date().toISOString(),
        finished_at: null,
        hints_used: 0,
        attempts: 0,
        final_outcome: null,
        time_to_solve_ms: null,
        interactions_summary: null,
      },
    ];
    dump.submissions = [
      {
        id: subId,
        org_id: "self",
        episode_id: epId,
        submitted_at: new Date().toISOString(),
        code: "noop",
        passed: false,
        runtime_ms: null,
      },
    ];
    dump.agent_calls = [
      {
        id: callId,
        org_id: "self",
        user_id: newUserId,
        session_id: null,
        episode_id: null,
        provider: "anthropic",
        model: "claude-haiku",
        role: null,
        task: "complete",
        prompt_version: null,
        input_tokens: 0,
        output_tokens: 0,
        cached_tokens: null,
        cost_usd: "0",
        pricing_version: "unknown",
        tool_used: null,
        latency_ms: 0,
        ok: true,
        called_at: new Date().toISOString(),
      },
    ];
    dump.notifications = [
      {
        id: notifId,
        org_id: "self",
        user_id: newUserId,
        channel: "in_app",
        title: "First-run",
        body: null,
        sent_at: new Date().toISOString(),
        read_at: null,
        dedupe_key: null,
      },
    ];

    const first = await importDump(db, dump);
    expect(first.user_created).toBe(true);
    expect(first.inserted.episodes).toBe(1);
    expect(first.inserted.submissions).toBe(1);
    expect(first.inserted.agent_calls).toBe(1);
    expect(first.inserted.notifications).toBe(1);

    const logs: string[] = [];
    const second = await importDump(db, dump, { logger: (l) => logs.push(l) });
    expect(second.user_created).toBe(false);
    expect(second.inserted.episodes).toBe(0);
    expect(second.inserted.submissions).toBe(0);
    expect(second.inserted.agent_calls).toBe(0);
    expect(second.inserted.notifications).toBe(0);
    expect(second.skipped.episodes).toBe(1);
    expect(second.skipped.submissions).toBe(1);
    expect(second.skipped.agent_calls).toBe(1);
    expect(second.skipped.notifications).toBe(1);
    // Each section emits one collision warning per skipped row.
    expect(logs.filter((l) => l.includes("episodes row"))).toHaveLength(1);
    expect(logs.filter((l) => l.includes("submissions row"))).toHaveLength(1);
    expect(logs.filter((l) => l.includes("agent_calls row"))).toHaveLength(1);
    expect(logs.filter((l) => l.includes("notifications row"))).toHaveLength(1);

    // The DB still has exactly one of each row (no duplicates).
    const epRows = await db.select().from(episodes).where(eq(episodes.id, epId));
    expect(epRows).toHaveLength(1);
    const subRows = await db.select().from(submissions).where(eq(submissions.id, subId));
    expect(subRows).toHaveLength(1);
    const callRows = await db.select().from(agent_calls).where(eq(agent_calls.id, callId));
    expect(callRows).toHaveLength(1);
    const notifRows = await db.select().from(notifications).where(eq(notifications.id, notifId));
    expect(notifRows).toHaveLength(1);
  });

  it("populates result.warnings array (mirrors the logger sink)", async () => {
    const newUserId = randomUuid();
    importedUserIds.push(newUserId);
    await db.insert(users).values({
      id: newUserId,
      email: `warnings-${Date.now()}@learnpro.local`,
    });

    const dump = makeMinimalDump({ user_id: newUserId });
    const result = await importDump(db, dump);
    expect(result.warnings.some((w) => w.includes("already exists"))).toBe(true);
  });

  // exportUserData is used by the round-trip test above.
  void exportUserData;
});

// =============================================================================
// Stub-data factories for the integration tests above.
// =============================================================================

function randomUuid(): string {
  return crypto.randomUUID();
}

// Walks a parsed dump and replaces every occurrence of `oldId` with `newId`. Used by the
// round-trip test to import a freshly-exported dump under a different user_id without
// touching the source rows.
function remapUserId(dump: unknown, oldId: string, newId: string): unknown {
  const json = JSON.stringify(dump).replaceAll(oldId, newId);
  return JSON.parse(json);
}

function remapEmail(dump: unknown, oldEmail: string, newEmail: string): unknown {
  const json = JSON.stringify(dump).replaceAll(oldEmail, newEmail);
  return JSON.parse(json);
}

// Walks every section of a parsed dump and rewrites the row primary keys to fresh UUIDs.
// FK pointers (submissions.episode_id, agent_calls.episode_id) are kept consistent by
// remapping in two passes. Used by the round-trip test to simulate a fresh target DB.
function remapAllRowIds(dump: unknown): unknown {
  const cloned = JSON.parse(JSON.stringify(dump)) as {
    episodes: { id: string }[];
    submissions: { id: string; episode_id: string }[];
    agent_calls: { id: string; episode_id: string | null }[];
    notifications: { id: string }[];
  };
  const epIdMap = new Map<string, string>();
  for (const ep of cloned.episodes) {
    const fresh = randomUuid();
    epIdMap.set(ep.id, fresh);
    ep.id = fresh;
  }
  for (const sub of cloned.submissions) {
    sub.id = randomUuid();
    const remapped = epIdMap.get(sub.episode_id);
    if (remapped) sub.episode_id = remapped;
  }
  for (const call of cloned.agent_calls) {
    call.id = randomUuid();
    if (call.episode_id) {
      const remapped = epIdMap.get(call.episode_id);
      if (remapped) call.episode_id = remapped;
    }
  }
  for (const n of cloned.notifications) {
    n.id = randomUuid();
  }
  return cloned;
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
