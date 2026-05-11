import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { LearnProDb } from "./client.js";
import { problems, SELF_HOSTED_ORG_ID, variant_gate_failures } from "./schema.js";

// STORY-039e — DB helpers for the variant gate-failures log. Inserts are fire-and-forget
// from the route's POV (the agent's `failureLogger` callback wraps this); reads power the
// admin Fastify route + Next.js page.
//
// The CHECK constraint on `failure_reason` lives in migration 0024 and is mirrored here in
// `VariantFailureReasonSchema` for Zod validation at the type boundary. Anything else is a
// programmer error and surfaces as a 500 — we don't sanitize at this layer.

export const VARIANT_FAILURE_REASONS = [
  "parse_error",
  "identity_mismatch",
  "spec_clarity_judge",
  "self_validation",
  "retry_exhausted",
] as const;

export const VariantFailureReasonSchema = z.enum(VARIANT_FAILURE_REASONS);
export type VariantFailureReason = z.infer<typeof VariantFailureReasonSchema>;

export interface InsertVariantGateFailureInput {
  source_problem_id: string;
  failure_reason: VariantFailureReason;
  failure_detail: Record<string, unknown>;
  model_id: string;
  attempt_number: number;
  org_id?: string;
  now?: Date;
}

export interface VariantGateFailureRow {
  id: string;
  org_id: string;
  source_problem_id: string;
  source_problem_slug: string | null;
  attempted_at: Date;
  failure_reason: VariantFailureReason;
  failure_detail: Record<string, unknown>;
  model_id: string;
  attempt_number: number;
}

export async function insertVariantGateFailure(
  db: LearnProDb,
  input: InsertVariantGateFailureInput,
): Promise<{ id: string }> {
  const reason = VariantFailureReasonSchema.parse(input.failure_reason);
  if (!Number.isInteger(input.attempt_number) || input.attempt_number < 1) {
    throw new Error(
      `insertVariantGateFailure: attempt_number must be a positive integer, got ${input.attempt_number}`,
    );
  }
  const now = input.now ?? new Date();
  const inserted = await db
    .insert(variant_gate_failures)
    .values({
      org_id: input.org_id ?? SELF_HOSTED_ORG_ID,
      source_problem_id: input.source_problem_id,
      failure_reason: reason,
      failure_detail: input.failure_detail,
      model_id: input.model_id,
      attempt_number: input.attempt_number,
      attempted_at: now,
    })
    .returning({ id: variant_gate_failures.id });
  const row = inserted[0];
  if (!row) throw new Error("insertVariantGateFailure: insert returned no row");
  return { id: row.id };
}

export interface ListVariantGateFailuresOptions {
  source_problem_id?: string;
  limit?: number;
  offset?: number;
  org_id?: string;
}

export interface ListVariantGateFailuresResult {
  failures: VariantGateFailureRow[];
  total: number;
}

// Returns failures newest-first with the source problem's slug joined in (the admin UI
// renders the slug, not the UUID). Pagination via `limit`/`offset`; the `total` value is the
// row count BEFORE pagination, so the admin page can show "N total". Capped at 200 per page
// (matches the route's max).
export async function listVariantGateFailures(
  db: LearnProDb,
  opts: ListVariantGateFailuresOptions = {},
): Promise<ListVariantGateFailuresResult> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);
  const orgIdValue = opts.org_id ?? SELF_HOSTED_ORG_ID;

  const filters = [eq(variant_gate_failures.org_id, orgIdValue)];
  if (opts.source_problem_id !== undefined) {
    filters.push(eq(variant_gate_failures.source_problem_id, opts.source_problem_id));
  }
  const where = filters.length === 1 ? filters[0] : and(...filters);

  const rows = await db
    .select({
      id: variant_gate_failures.id,
      org_id: variant_gate_failures.org_id,
      source_problem_id: variant_gate_failures.source_problem_id,
      source_problem_slug: problems.slug,
      attempted_at: variant_gate_failures.attempted_at,
      failure_reason: variant_gate_failures.failure_reason,
      failure_detail: variant_gate_failures.failure_detail,
      model_id: variant_gate_failures.model_id,
      attempt_number: variant_gate_failures.attempt_number,
    })
    .from(variant_gate_failures)
    .leftJoin(problems, eq(variant_gate_failures.source_problem_id, problems.id))
    .where(where)
    .orderBy(desc(variant_gate_failures.attempted_at))
    .limit(limit)
    .offset(offset);

  const countRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(variant_gate_failures)
    .where(where);
  const total = countRows[0]?.count ?? 0;

  return {
    failures: rows.map((r) => ({
      id: r.id,
      org_id: r.org_id,
      source_problem_id: r.source_problem_id,
      source_problem_slug: r.source_problem_slug,
      attempted_at: r.attempted_at,
      failure_reason: VariantFailureReasonSchema.parse(r.failure_reason),
      failure_detail: (r.failure_detail ?? {}) as Record<string, unknown>,
      model_id: r.model_id,
      attempt_number: r.attempt_number,
    })),
    total,
  };
}
