import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { generateProblemVariant } from "@learnpro/agent";
import {
  insertProblemVariant,
  listProblemVariants,
  problems as problemsTable,
  tracks as tracksTable,
  type LearnProDb,
} from "@learnpro/db";
import type { LLMProvider } from "@learnpro/llm";
import {
  ProblemDefSchema,
  isImplementProblem,
  type ImplementProblemDef,
  type ProblemDef,
} from "@learnpro/problems";
import type { SessionResolver } from "./session.js";

// STORY-039 — POST /v1/problem-variants generates (or returns cached) LLM variants of a
// curated seed problem. The seam is auth-gated, but the cache is shared across users (one
// row per source problem) — variants are content, not user data, so caching globally is
// fine. The route's job:
//
//   1. Look up the source problem in `problems` (reconstruct the `ProblemDef` from the
//      `hidden_tests` jsonb payload — same shape `loadEpisodeProblemRow` uses).
//   2. Reject if the source isn't an `implement` problem (variants are out-of-scope for
//      debug / comprehension in v1).
//   3. Read the cache. If we already have ≥ requested count, return them.
//   4. Otherwise call `generateProblemVariant` to top up the cache. The agent validates
//      against `ProblemDefSchema` AND retries once on a parse failure; on persistent
//      failure the route returns 200 with `variants: []` (best-effort, never block).
//   5. Persist the freshly-generated variants and return the union.

const PostBodySchema = z.object({
  source_problem_id: z.string().uuid(),
  count: z.number().int().min(1).max(5).optional(),
});

const DEFAULT_COUNT = 1;

export interface ProblemVariantsRouteOptions {
  db: LearnProDb;
  llm: LLMProvider;
  sessionResolver: SessionResolver;
  // Override the agent's model — production defaults to Haiku via the agent itself.
  model?: string;
}

export function registerProblemVariantsRoutes(
  app: FastifyInstance,
  opts: ProblemVariantsRouteOptions,
): void {
  const { db, llm, sessionResolver } = opts;

  app.post("/v1/problem-variants", async (req, reply) => {
    const session = await sessionResolver(req);
    if (!session) return reply.code(401).send({ error: "unauthorized" });

    const parsed = PostBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request", issues: parsed.error.issues });
    }
    const count = parsed.data.count ?? DEFAULT_COUNT;

    const source = await loadProblemDef(db, parsed.data.source_problem_id);
    if (!source) {
      return reply.code(404).send({ error: "source_problem_not_found" });
    }
    if (source.kind !== "implement") {
      return reply.code(400).send({
        error: "unsupported_kind",
        message:
          "Variant generation only supports kind=implement seed problems. Debug and comprehension are out of v1 scope.",
      });
    }
    if (!source.def || !isImplementProblem(source.def)) {
      return reply.code(404).send({ error: "source_problem_not_found" });
    }
    const sourceImplement = source.def;

    const cachedRows = await listProblemVariants(db, {
      source_problem_id: parsed.data.source_problem_id,
      limit: 100,
    });
    const cachedDefs = cachedRows
      .map((r) => ProblemDefSchema.safeParse(r.variant_def))
      .filter((p): p is { success: true; data: ProblemDef } => p.success)
      .map((p) => p.data);

    if (cachedDefs.length >= count) {
      return reply.code(200).send({
        variants: cachedDefs.slice(0, count),
        cache_hit: true,
        generated: 0,
      });
    }

    const need = count - cachedDefs.length;
    let agentResult;
    try {
      agentResult = await generateProblemVariant({
        llm,
        user_id: session.user_id,
        source: sourceImplement,
        count: need,
        ...(opts.model !== undefined ? { model: opts.model } : {}),
      });
    } catch (err) {
      req.log.warn({ err }, "problem-variant agent failed — surfacing 503");
      return reply.code(503).send({
        error: "variant_generation_unavailable",
        message: "The variant generator is briefly unavailable. Try again in a moment.",
      });
    }

    const persisted: ProblemDef[] = [];
    for (const v of agentResult.variants) {
      try {
        const row = await insertProblemVariant(db, {
          source_problem_id: parsed.data.source_problem_id,
          variant_def: v,
        });
        const reparsed = ProblemDefSchema.safeParse(row.variant_def);
        if (reparsed.success) persisted.push(reparsed.data);
      } catch (err) {
        req.log.warn({ err, slug: v.slug }, "failed to persist variant — skipping");
      }
    }

    return reply.code(200).send({
      variants: [...cachedDefs, ...persisted].slice(0, count),
      cache_hit: false,
      generated: persisted.length,
    });
  });
}

interface SourceProblemContext {
  problem_id: string;
  kind: string;
  def: ProblemDef | null;
}

// Reconstruct the `ProblemDef` for a problem row. `problems.hidden_tests` carries the
// per-kind payload (cases / public_examples / reference_solution / concept_tags /
// expected_median_time_to_solve_ms). Mirrors `problemDefFromRow` in
// packages/agent/src/drizzle-deps.ts but scoped to the problem-variants route — kept
// inline so this route doesn't reach into the agent's internals.
async function loadProblemDef(
  db: LearnProDb,
  problem_id: string,
): Promise<SourceProblemContext | null> {
  const rows = await db
    .select({
      id: problemsTable.id,
      slug: problemsTable.slug,
      name: problemsTable.name,
      language: problemsTable.language,
      difficulty: problemsTable.difficulty,
      kind: problemsTable.kind,
      bug_archetype: problemsTable.bug_archetype,
      comprehension_format: problemsTable.comprehension_format,
      answer_format: problemsTable.answer_format,
      statement: problemsTable.statement,
      starter_code: problemsTable.starter_code,
      hidden_tests: problemsTable.hidden_tests,
      track_slug: tracksTable.slug,
    })
    .from(problemsTable)
    .innerJoin(tracksTable, eq(problemsTable.track_id, tracksTable.id))
    .where(and(eq(problemsTable.id, problem_id)))
    .limit(1);
  const r = rows[0];
  if (!r) return null;

  const ht = (r.hidden_tests ?? {}) as {
    cases?: Array<{ input: unknown; expected: unknown; weight?: number }>;
    public_examples?: Array<{ input: unknown; expected: unknown }>;
    reference_solution?: string;
    concept_tags?: string[];
    expected_median_time_to_solve_ms?: number;
  };

  if (r.kind !== "implement") {
    return { problem_id: r.id, kind: r.kind, def: null };
  }

  const synth = {
    kind: "implement" as const,
    slug: r.slug,
    name: r.name,
    language: r.language,
    difficulty: difficultyTextToInt(r.difficulty),
    track: r.track_slug,
    concept_tags: ht.concept_tags ?? ["fundamentals"],
    statement: r.statement,
    starter_code: r.starter_code ?? "",
    reference_solution: ht.reference_solution ?? "",
    public_examples:
      ht.public_examples && ht.public_examples.length > 0
        ? ht.public_examples
        : ht.cases && ht.cases.length > 0
          ? [ht.cases[0]!]
          : [{ input: null, expected: null }],
    hidden_tests:
      ht.cases && ht.cases.length > 0 ? ht.cases : [{ input: null, expected: null }],
    expected_median_time_to_solve_ms: ht.expected_median_time_to_solve_ms ?? 300_000,
  };

  const parsed = ProblemDefSchema.safeParse(synth);
  if (!parsed.success) return { problem_id: r.id, kind: r.kind, def: null };
  return { problem_id: r.id, kind: r.kind, def: parsed.data as ImplementProblemDef };
}

function difficultyTextToInt(text: string): number {
  const n = Number(text);
  if (Number.isInteger(n) && n >= 1 && n <= 5) return n;
  switch (text) {
    case "easy":
      return 2;
    case "medium":
      return 3;
    case "hard":
      return 4;
    default:
      return 3;
  }
}
