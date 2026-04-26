import type { LLMTelemetryEvent } from "@learnpro/llm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type LearnProDb } from "./client.js";
import { DrizzleLLMTelemetrySink } from "./llm-telemetry-sink.js";
import { DrizzleUsageStore } from "./llm-usage-store.js";
import { runMigrations } from "./migrate.js";
import { agent_calls, organizations, users } from "./schema.js";
import { eq } from "drizzle-orm";
import type { Pool } from "pg";

const DATABASE_URL = process.env["DATABASE_URL"];

// Integration tests against a real Postgres (Docker Compose, see infra/docker/docker-compose.dev.yaml).
// Skipped when DATABASE_URL isn't set so `pnpm test` still passes in CI without a DB.
// Run locally with: `DATABASE_URL=postgresql://learnpro:learnpro@localhost:5432/learnpro pnpm --filter @learnpro/db test`
describe.skipIf(!DATABASE_URL)("DrizzleUsageStore (integration)", () => {
  let db: LearnProDb;
  let pool: Pool;
  let testUserId: string;

  beforeAll(async () => {
    const created = createDb({ connectionString: DATABASE_URL ?? "" });
    db = created.db;
    pool = created.pool;
    await runMigrations();
    await db
      .insert(organizations)
      .values({ id: "self", name: "Self-hosted" })
      .onConflictDoNothing();
    const inserted = await db
      .insert(users)
      .values({ email: `usage-test-${Date.now()}@learnpro.local` })
      .returning({ id: users.id });
    const id = inserted[0]?.id;
    if (!id) throw new Error("failed to insert test user");
    testUserId = id;
  });

  afterAll(async () => {
    if (db) {
      await db.delete(agent_calls).where(eq(agent_calls.user_id, testUserId));
      await db.delete(users).where(eq(users.id, testUserId));
    }
    await pool?.end();
  });

  beforeEach(async () => {
    await db.delete(agent_calls).where(eq(agent_calls.user_id, testUserId));
  });

  it("returns 0 when the user has no calls today", async () => {
    const store = new DrizzleUsageStore({ db });
    const used = await store.today(testUserId);
    expect(used).toBe(0);
  });

  it("aggregates today's input + output tokens for the user", async () => {
    const sink = new DrizzleLLMTelemetrySink({ db });
    sink.record(event({ user_id: testUserId, input_tokens: 100, output_tokens: 50 }));
    sink.record(event({ user_id: testUserId, input_tokens: 200, output_tokens: 75 }));
    await flushSinkInsertsAgainst(db, testUserId, 2);

    const store = new DrizzleUsageStore({ db });
    const used = await store.today(testUserId);
    expect(used).toBe(425);
  });

  it("excludes calls from yesterday (UTC midnight boundary)", async () => {
    const yesterday = new Date(Date.now() - 36 * 60 * 60 * 1000);
    const sink = new DrizzleLLMTelemetrySink({ db });
    sink.record(
      event({
        user_id: testUserId,
        input_tokens: 999,
        output_tokens: 999,
        decided_at: yesterday.toISOString(),
      }),
    );
    sink.record(event({ user_id: testUserId, input_tokens: 10, output_tokens: 5 }));
    await flushSinkInsertsAgainst(db, testUserId, 2);

    const store = new DrizzleUsageStore({ db });
    const used = await store.today(testUserId);
    expect(used).toBe(15);
  });

  it("does not count other users' tokens", async () => {
    const otherUserId = await insertOtherUser(db);
    try {
      const sink = new DrizzleLLMTelemetrySink({ db });
      sink.record(event({ user_id: otherUserId, input_tokens: 9999, output_tokens: 9999 }));
      sink.record(event({ user_id: testUserId, input_tokens: 7, output_tokens: 3 }));
      await flushSinkInsertsAgainst(db, testUserId, 1);
      await flushSinkInsertsAgainst(db, otherUserId, 1);

      const store = new DrizzleUsageStore({ db });
      const used = await store.today(testUserId);
      expect(used).toBe(10);
    } finally {
      await db.delete(agent_calls).where(eq(agent_calls.user_id, otherUserId));
      await db.delete(users).where(eq(users.id, otherUserId));
    }
  });

  it("record() is a no-op (sink is the single source of truth)", async () => {
    const store = new DrizzleUsageStore({ db });
    await store.record();
    const used = await store.today(testUserId);
    expect(used).toBe(0);
  });
});

function event(overrides: Partial<LLMTelemetryEvent> = {}): LLMTelemetryEvent {
  return {
    provider: "anthropic",
    model: "claude-haiku-4-5-20251001",
    task: "complete",
    input_tokens: 0,
    output_tokens: 0,
    cost_usd: 0,
    pricing_version: "2026-04-26",
    latency_ms: 1,
    ok: true,
    decided_at: new Date().toISOString(),
    ...overrides,
  };
}

// The sink fires inserts in the background (catch-and-log promise), so we poll until the
// expected row count lands. This keeps tests deterministic without exposing internals.
async function flushSinkInsertsAgainst(
  db: LearnProDb,
  userId: string,
  expected: number,
  timeoutMs = 2000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rows = await db.select().from(agent_calls).where(eq(agent_calls.user_id, userId));
    if (rows.length >= expected) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`flushSinkInserts timed out waiting for ${expected} rows for user ${userId}`);
}

async function insertOtherUser(db: LearnProDb): Promise<string> {
  const inserted = await db
    .insert(users)
    .values({ email: `usage-test-other-${Date.now()}@learnpro.local` })
    .returning({ id: users.id });
  const id = inserted[0]?.id;
  if (!id) throw new Error("failed to insert other test user");
  return id;
}
