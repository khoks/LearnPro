import { eq } from "drizzle-orm";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type LearnProDb } from "./client.js";
import { runMigrations } from "./migrate.js";
import { organizations, problems, tracks, variant_gate_failures } from "./schema.js";
import { insertVariantGateFailure, listVariantGateFailures } from "./variant-gate-failures.js";

const DATABASE_URL = process.env["DATABASE_URL"];

describe.skipIf(!DATABASE_URL)("variant_gate_failures DB helpers (integration)", () => {
  let db: LearnProDb;
  let pool: Pool;
  let trackId: string;
  let problemA: string;
  let problemB: string;

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
        slug: `variant-gate-fail-track-${Date.now()}`,
        name: "Variant gate-failures test track",
        language: "python",
      })
      .returning({ id: tracks.id });
    trackId = insertedTrack[0]!.id;

    const insertedA = await db
      .insert(problems)
      .values({
        track_id: trackId,
        slug: `variant-gate-fail-source-a-${Date.now()}`,
        name: "Variant gate-failures source A",
        language: "python",
        difficulty: "2",
        statement: "noop",
        hidden_tests: { cases: [], concept_tags: ["arrays"] },
      })
      .returning({ id: problems.id });
    problemA = insertedA[0]!.id;

    const insertedB = await db
      .insert(problems)
      .values({
        track_id: trackId,
        slug: `variant-gate-fail-source-b-${Date.now()}`,
        name: "Variant gate-failures source B",
        language: "python",
        difficulty: "2",
        statement: "noop",
        hidden_tests: { cases: [], concept_tags: ["arrays"] },
      })
      .returning({ id: problems.id });
    problemB = insertedB[0]!.id;
  });

  afterAll(async () => {
    if (db) {
      await db
        .delete(variant_gate_failures)
        .where(eq(variant_gate_failures.source_problem_id, problemA));
      await db
        .delete(variant_gate_failures)
        .where(eq(variant_gate_failures.source_problem_id, problemB));
      await db.delete(problems).where(eq(problems.id, problemA));
      await db.delete(problems).where(eq(problems.id, problemB));
      await db.delete(tracks).where(eq(tracks.id, trackId));
    }
    await pool?.end();
  });

  beforeEach(async () => {
    await db
      .delete(variant_gate_failures)
      .where(eq(variant_gate_failures.source_problem_id, problemA));
    await db
      .delete(variant_gate_failures)
      .where(eq(variant_gate_failures.source_problem_id, problemB));
  });

  it("inserts + lists a parse_error failure", async () => {
    await insertVariantGateFailure(db, {
      source_problem_id: problemA,
      failure_reason: "parse_error",
      failure_detail: { zod_error: "invalid JSON: unexpected token at position 0" },
      model_id: "claude-haiku-4",
      attempt_number: 1,
    });
    const result = await listVariantGateFailures(db, { source_problem_id: problemA });
    expect(result.total).toBe(1);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]!.failure_reason).toBe("parse_error");
    expect(result.failures[0]!.failure_detail).toEqual({
      zod_error: "invalid JSON: unexpected token at position 0",
    });
    expect(result.failures[0]!.attempt_number).toBe(1);
    expect(result.failures[0]!.model_id).toBe("claude-haiku-4");
  });

  it("accepts all 5 failure_reason values from the CHECK constraint", async () => {
    const reasons = [
      "parse_error",
      "identity_mismatch",
      "spec_clarity_judge",
      "self_validation",
      "retry_exhausted",
    ] as const;
    for (const reason of reasons) {
      await insertVariantGateFailure(db, {
        source_problem_id: problemA,
        failure_reason: reason,
        failure_detail: { reason_detail: reason },
        model_id: "claude-haiku-4",
        attempt_number: 1,
      });
    }
    const result = await listVariantGateFailures(db, { source_problem_id: problemA });
    expect(result.total).toBe(5);
    expect(new Set(result.failures.map((f) => f.failure_reason))).toEqual(new Set(reasons));
  });

  it("filters by source_problem_id and ignores other source problems", async () => {
    await insertVariantGateFailure(db, {
      source_problem_id: problemA,
      failure_reason: "parse_error",
      failure_detail: {},
      model_id: "claude-haiku-4",
      attempt_number: 1,
    });
    await insertVariantGateFailure(db, {
      source_problem_id: problemB,
      failure_reason: "identity_mismatch",
      failure_detail: { field: "language", expected: "python", got: "javascript" },
      model_id: "claude-haiku-4",
      attempt_number: 1,
    });

    const onlyA = await listVariantGateFailures(db, { source_problem_id: problemA });
    expect(onlyA.failures).toHaveLength(1);
    expect(onlyA.failures[0]!.source_problem_id).toBe(problemA);
    expect(onlyA.failures[0]!.failure_reason).toBe("parse_error");

    const onlyB = await listVariantGateFailures(db, { source_problem_id: problemB });
    expect(onlyB.failures).toHaveLength(1);
    expect(onlyB.failures[0]!.source_problem_id).toBe(problemB);
    expect(onlyB.failures[0]!.failure_reason).toBe("identity_mismatch");
  });

  it("joins source_problem_slug from problems for the admin UI", async () => {
    await insertVariantGateFailure(db, {
      source_problem_id: problemA,
      failure_reason: "self_validation",
      failure_detail: { test_index: 0, reason: "wrong_answer" },
      model_id: "claude-haiku-4",
      attempt_number: 2,
    });
    const result = await listVariantGateFailures(db, { source_problem_id: problemA });
    expect(result.failures[0]!.source_problem_slug).toMatch(/^variant-gate-fail-source-a-/);
  });

  it("returns failures newest-first", async () => {
    await insertVariantGateFailure(db, {
      source_problem_id: problemA,
      failure_reason: "parse_error",
      failure_detail: { order: 1 },
      model_id: "claude-haiku-4",
      attempt_number: 1,
      now: new Date("2026-05-10T10:00:00Z"),
    });
    await insertVariantGateFailure(db, {
      source_problem_id: problemA,
      failure_reason: "identity_mismatch",
      failure_detail: { order: 2 },
      model_id: "claude-haiku-4",
      attempt_number: 1,
      now: new Date("2026-05-11T10:00:00Z"),
    });
    const result = await listVariantGateFailures(db, { source_problem_id: problemA });
    expect(result.failures[0]!.failure_detail).toEqual({ order: 2 });
    expect(result.failures[1]!.failure_detail).toEqual({ order: 1 });
  });

  it("paginates via limit + offset and reports total before pagination", async () => {
    for (let i = 0; i < 5; i++) {
      await insertVariantGateFailure(db, {
        source_problem_id: problemA,
        failure_reason: "parse_error",
        failure_detail: { i },
        model_id: "claude-haiku-4",
        attempt_number: 1,
        now: new Date(`2026-05-1${i}T10:00:00Z`),
      });
    }
    const page1 = await listVariantGateFailures(db, { source_problem_id: problemA, limit: 2 });
    expect(page1.failures).toHaveLength(2);
    expect(page1.total).toBe(5);

    const page2 = await listVariantGateFailures(db, {
      source_problem_id: problemA,
      limit: 2,
      offset: 2,
    });
    expect(page2.failures).toHaveLength(2);
    expect(page2.total).toBe(5);
  });

  it("rejects an invalid failure_reason at the Zod boundary", async () => {
    await expect(
      insertVariantGateFailure(db, {
        source_problem_id: problemA,
        // @ts-expect-error — invalid reason for boundary check
        failure_reason: "something_else",
        failure_detail: {},
        model_id: "claude-haiku-4",
        attempt_number: 1,
      }),
    ).rejects.toThrow();
  });

  it("rejects attempt_number < 1", async () => {
    await expect(
      insertVariantGateFailure(db, {
        source_problem_id: problemA,
        failure_reason: "parse_error",
        failure_detail: {},
        model_id: "claude-haiku-4",
        attempt_number: 0,
      }),
    ).rejects.toThrow();
  });
});
