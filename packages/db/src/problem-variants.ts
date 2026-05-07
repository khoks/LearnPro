import { desc, eq } from "drizzle-orm";
import type { LearnProDb } from "./client.js";
import { problem_variants, SELF_HOSTED_ORG_ID, type ProblemVariant } from "./schema.js";

// STORY-039 — DB helpers for the LLM-generated problem-variant cache. The pure agent lives
// in @learnpro/agent; the route handler in apps/api validates `variant_def` against
// `ProblemDefSchema` from @learnpro/problems before reading. We deliberately do NOT import
// @learnpro/problems here to avoid the existing @learnpro/problems → @learnpro/db
// dependency edge becoming a cycle. The boundary contract is: the agent + route own
// validation; this file just stores/retrieves the raw jsonb.

export interface ProblemVariantRow {
  id: string;
  org_id: string;
  source_problem_id: string;
  variant_def: unknown;
  created_at: Date;
}

function toRow(row: ProblemVariant): ProblemVariantRow {
  return {
    id: row.id,
    org_id: row.org_id,
    source_problem_id: row.source_problem_id,
    variant_def: row.variant_def,
    created_at: row.created_at,
  };
}

export interface ListProblemVariantsOptions {
  source_problem_id: string;
  limit?: number;
}

// Returns the cached variants for a source problem, newest first. The caller validates the
// `variant_def` shape with `ProblemDefSchema`.
export async function listProblemVariants(
  db: LearnProDb,
  opts: ListProblemVariantsOptions,
): Promise<ProblemVariantRow[]> {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100);
  const rows = await db
    .select()
    .from(problem_variants)
    .where(eq(problem_variants.source_problem_id, opts.source_problem_id))
    .orderBy(desc(problem_variants.created_at))
    .limit(limit);
  return rows.map(toRow);
}

export interface InsertProblemVariantInput {
  source_problem_id: string;
  variant_def: unknown;
  org_id?: string;
  now?: Date;
}

// Inserts a single cached variant row. Caller is responsible for validating `variant_def`
// against `ProblemDefSchema` before passing it in.
export async function insertProblemVariant(
  db: LearnProDb,
  input: InsertProblemVariantInput,
): Promise<ProblemVariantRow> {
  const now = input.now ?? new Date();
  const inserted = await db
    .insert(problem_variants)
    .values({
      org_id: input.org_id ?? SELF_HOSTED_ORG_ID,
      source_problem_id: input.source_problem_id,
      variant_def: input.variant_def,
      created_at: now,
    })
    .returning();
  const row = inserted[0];
  if (!row) throw new Error("insertProblemVariant: insert returned no row");
  return toRow(row);
}
