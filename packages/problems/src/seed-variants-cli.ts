// STORY-039f — operator CLI for seeding the `problem_variants` cache with N variants per
// curated source problem. Wraps the `@learnpro/agent` `seedVariantsForProblem` batch
// helper with DB lookup, env validation, and progress reporting.
//
// Usage:
//   pnpm --filter @learnpro/problems seed:variants -- --dry-run --count 3 --all-implement
//   pnpm --filter @learnpro/problems seed:variants -- --source-slug reverse-string --count 3
//
// The actual seeding (running with `ANTHROPIC_API_KEY` set) is an OPERATOR task — it costs
// ~$0.10-0.40 per variant attempt. Always run with `--dry-run` first to preview the work.
//
// NOTE on the workspace dep cycle: `@learnpro/agent` is listed under devDependencies in
// this package's package.json. It's the CLI's only consumer of agent types, and the agent
// depends on `@learnpro/problems` at runtime — making the back-edge a runtime cycle would
// be wrong. Pnpm still warns about the cycle because it walks dev edges; the warning is
// expected and harmless for tooling-only entry points like this one.

import { eq, and } from "drizzle-orm";
import { z } from "zod";
import {
  seedVariantsForProblem,
  SEED_VARIANTS_MAX_TARGET_COUNT,
  type VariantCacheStore,
} from "@learnpro/agent";
import {
  AnthropicSdkTransport,
  buildLLMProvider,
  loadLLMConfigFromEnv,
  type LLMProvider,
} from "@learnpro/llm";
import {
  createDb,
  insertProblemVariant,
  listProblemVariants,
  loadDatabaseUrl,
  problems as problemsTable,
  SELF_HOSTED_ORG_ID,
  tracks as tracksTable,
  type LearnProDb,
} from "@learnpro/db";
import {
  ProblemDefSchema,
  isImplementProblem,
  loadProblems,
  type ImplementProblemDef,
  type ProblemDef,
  type ProblemLanguage,
} from "./index.js";

// CLI args are parsed with Zod for descriptive errors. The "all" sentinel for language
// pre-loads in the schema lets `--language all` flow through without coercion.
const CliArgsSchema = z
  .object({
    source_slug: z.string().min(1).optional(),
    all_implement: z.boolean().default(false),
    count: z.number().int().min(1).max(SEED_VARIANTS_MAX_TARGET_COUNT).default(3),
    dry_run: z.boolean().default(false),
    language: z.enum(["python", "typescript", "all"]).default("all"),
  })
  .superRefine((data, ctx) => {
    if (data.source_slug !== undefined && data.all_implement) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "--source-slug and --all-implement are mutually exclusive",
      });
    }
    if (data.source_slug === undefined && !data.all_implement) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "specify --source-slug <slug> OR --all-implement",
      });
    }
  });
export type CliArgs = z.infer<typeof CliArgsSchema>;

export interface CliEnv {
  ANTHROPIC_API_KEY?: string;
  DATABASE_URL?: string;
}

export interface CliDeps {
  argv: ReadonlyArray<string>;
  env: CliEnv;
  // Hooks so tests can supply an in-memory DB / fake LLM / canned source list without
  // mocking Postgres. In production the entry point wires the real implementations.
  resolveDb?: (env: CliEnv) => Promise<{ db: LearnProDb; close: () => Promise<void> }>;
  resolveLlm?: (env: CliEnv) => Promise<LLMProvider>;
  resolveSources?: (args: CliArgs) => Promise<ImplementProblemDef[]>;
  resolveProblemId?: (db: LearnProDb, slug: string) => Promise<string | null>;
  buildCacheStore?: (db: LearnProDb) => VariantCacheStore;
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
}

export interface CliResult {
  exit_code: 0 | 1 | 2;
  // Aggregate counters across all sources processed. `total_cached` = sum of pre-existing
  // cached variants found; `total_generated` = freshly generated this run; `total_failed`
  // = LLM attempts that produced no usable variant.
  total_cached: number;
  total_generated: number;
  total_failed: number;
  // Number of sources that short-circuited (cache already >= target).
  total_skipped_sources: number;
  // Number of sources actually processed (LLM was called for >= 1 slot).
  total_active_sources: number;
}

// Main entry point. Returns the exit code + summary; the caller invokes `process.exit()`.
export async function runSeedVariantsCli(deps: CliDeps): Promise<CliResult> {
  const stdout = deps.stdout ?? ((line) => process.stdout.write(`${line}\n`));
  const stderr = deps.stderr ?? ((line) => process.stderr.write(`${line}\n`));

  let args: CliArgs;
  try {
    args = parseCliArgs(deps.argv);
  } catch (err) {
    stderr(`[seed:variants] ${(err as Error).message}`);
    stderr("[seed:variants] usage:");
    stderr(
      "  pnpm --filter @learnpro/problems seed:variants -- --dry-run --count 3 --all-implement",
    );
    stderr(
      "  pnpm --filter @learnpro/problems seed:variants -- --source-slug <slug> --count 3",
    );
    return zeroResult(2);
  }

  if (!args.dry_run && (deps.env.ANTHROPIC_API_KEY ?? "").trim() === "") {
    stderr(
      "[seed:variants] ANTHROPIC_API_KEY is not set. Either export it or rerun with --dry-run.",
    );
    return zeroResult(2);
  }
  if ((deps.env.DATABASE_URL ?? "").trim() === "") {
    stderr(
      "[seed:variants] DATABASE_URL is not set. Variant cache persistence requires a Postgres connection.",
    );
    return zeroResult(2);
  }

  // Connect to DB. The dry-run path still needs the DB (to know what's already cached) —
  // a true offline mode would be a future addition.
  const { db, close } = await (deps.resolveDb ?? defaultResolveDb)(deps.env);
  let llm: LLMProvider;
  try {
    llm = await (deps.resolveLlm ?? defaultResolveLlm)(deps.env);
  } catch (err) {
    stderr(`[seed:variants] failed to build LLM: ${(err as Error).message}`);
    await close();
    return zeroResult(2);
  }
  const buildCacheStore = deps.buildCacheStore ?? defaultBuildCacheStore;
  const resolveProblemId = deps.resolveProblemId ?? defaultResolveProblemId;
  const resolveSources = deps.resolveSources ?? defaultResolveSources;

  let sources: ImplementProblemDef[];
  try {
    sources = await resolveSources(args);
  } catch (err) {
    stderr(`[seed:variants] failed to resolve sources: ${(err as Error).message}`);
    await close();
    return zeroResult(2);
  }
  if (sources.length === 0) {
    stderr("[seed:variants] no source problems matched the selection — nothing to do.");
    await close();
    return zeroResult(2);
  }

  const cacheStore = buildCacheStore(db);
  const counters: Mutable<CliResult> = {
    exit_code: 0,
    total_cached: 0,
    total_generated: 0,
    total_failed: 0,
    total_skipped_sources: 0,
    total_active_sources: 0,
  };

  stdout(
    `[seed:variants] sources=${sources.length} count=${args.count} dryRun=${args.dry_run} lang=${args.language}`,
  );

  let progress_idx = 0;
  for (const source of sources) {
    progress_idx += 1;
    const id = await resolveProblemId(db, source.slug);
    if (!id) {
      stdout(
        `[${progress_idx}/${sources.length}] ${source.language}:${source.slug} (skip: not seeded in DB)`,
      );
      counters.total_failed += args.count;
      continue;
    }

    const result = await seedVariantsForProblem({
      llm,
      sourceProblem: source,
      sourceProblemId: id,
      targetCount: args.count,
      cache: cacheStore,
      dryRun: args.dry_run,
      onProgress: {
        generated: (e) => {
          stdout(
            `[${progress_idx}/${sources.length}] ${source.language}:${source.slug} -> ${e.slug} (ok, slot ${e.attempt})`,
          );
        },
        failed: (e) => {
          stdout(
            `[${progress_idx}/${sources.length}] ${source.language}:${source.slug} (fail slot ${e.attempt}: ${e.reason})`,
          );
        },
        skipped: (e) => {
          stdout(
            `[${progress_idx}/${sources.length}] ${source.language}:${source.slug} (skip: cached ${e.cached}/${e.target})`,
          );
        },
      },
    });

    counters.total_cached += result.cached;
    counters.total_generated += result.generated;
    counters.total_failed += result.failed;
    if (args.dry_run && result.would_generate !== undefined && result.would_generate > 0) {
      stdout(
        `[${progress_idx}/${sources.length}] ${source.language}:${source.slug} (dry-run: would generate ${result.would_generate})`,
      );
    }
    if (result.generated === 0 && result.failed === 0 && (result.would_generate ?? 0) === 0) {
      counters.total_skipped_sources += 1;
    } else {
      counters.total_active_sources += 1;
    }
  }

  stdout(
    `[seed:variants] summary: generated=${counters.total_generated} failed=${counters.total_failed} cached_total=${counters.total_cached} active=${counters.total_active_sources} skipped=${counters.total_skipped_sources}`,
  );
  await close();
  return counters;
}

function parseCliArgs(argv: ReadonlyArray<string>): CliArgs {
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === undefined) continue;
    if (token === "--dry-run") {
      flags["dry_run"] = true;
      continue;
    }
    if (token === "--all-implement") {
      flags["all_implement"] = true;
      continue;
    }
    if (token === "--source-slug") {
      const next = argv[i + 1];
      if (next === undefined) {
        throw new Error("--source-slug requires a value");
      }
      flags["source_slug"] = next;
      i++;
      continue;
    }
    if (token === "--count") {
      const next = argv[i + 1];
      if (next === undefined) {
        throw new Error("--count requires a value");
      }
      const n = Number(next);
      if (!Number.isFinite(n) || !Number.isInteger(n)) {
        throw new Error(`--count expects an integer, got "${next}"`);
      }
      flags["count"] = n as unknown as string;
      i++;
      continue;
    }
    if (token === "--language") {
      const next = argv[i + 1];
      if (next === undefined) {
        throw new Error("--language requires a value (python | typescript | all)");
      }
      flags["language"] = next;
      i++;
      continue;
    }
    if (token === "--help" || token === "-h") {
      throw new Error("see usage below");
    }
    throw new Error(`unknown argument: ${token}`);
  }
  const parsed = CliArgsSchema.safeParse(flags);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  }
  return parsed.data;
}

async function defaultResolveDb(
  env: CliEnv,
): Promise<{ db: LearnProDb; close: () => Promise<void> }> {
  const url = loadDatabaseUrl(env as NodeJS.ProcessEnv);
  const { db, pool } = createDb({ connectionString: url });
  return {
    db,
    close: async () => {
      await pool.end();
    },
  };
}

async function defaultResolveLlm(env: CliEnv): Promise<LLMProvider> {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.trim() === "") {
    throw new Error(
      "ANTHROPIC_API_KEY is required for non-dry-run mode (refused earlier in CLI flow)",
    );
  }
  const config = loadLLMConfigFromEnv(env as NodeJS.ProcessEnv);
  return buildLLMProvider({
    config,
    anthropicTransport: new AnthropicSdkTransport({ apiKey }),
  });
}

async function defaultResolveSources(args: CliArgs): Promise<ImplementProblemDef[]> {
  const all = loadProblems();
  return all
    .filter((p): p is ImplementProblemDef => isImplementProblem(p))
    .filter((p) => matchesLanguage(p.language, args.language))
    .filter((p) => (args.source_slug !== undefined ? p.slug === args.source_slug : true));
}

function matchesLanguage(actual: ProblemLanguage, filter: CliArgs["language"]): boolean {
  if (filter === "all") return true;
  return actual === filter;
}

async function defaultResolveProblemId(db: LearnProDb, slug: string): Promise<string | null> {
  // The cache table FKs `problems.id`; we look up by (org_id, slug). The CLI assumes the
  // self-hosted org which matches all seeded problems.
  const rows = await db
    .select({ id: problemsTable.id })
    .from(problemsTable)
    .innerJoin(tracksTable, eq(problemsTable.track_id, tracksTable.id))
    .where(and(eq(problemsTable.org_id, SELF_HOSTED_ORG_ID), eq(problemsTable.slug, slug)))
    .limit(1);
  return rows[0]?.id ?? null;
}

function defaultBuildCacheStore(db: LearnProDb): VariantCacheStore {
  return {
    async list(source_problem_id: string): Promise<ProblemDef[]> {
      const rows = await listProblemVariants(db, { source_problem_id, limit: 100 });
      const out: ProblemDef[] = [];
      for (const r of rows) {
        const parsed = ProblemDefSchema.safeParse(r.variant_def);
        if (parsed.success) out.push(parsed.data);
      }
      return out;
    },
    async insert(input): Promise<ProblemDef> {
      const row = await insertProblemVariant(db, {
        source_problem_id: input.source_problem_id,
        variant_def: input.variant_def,
      });
      const reparsed = ProblemDefSchema.safeParse(row.variant_def);
      if (!reparsed.success) {
        throw new Error(`re-validation of persisted variant failed: ${reparsed.error.message}`);
      }
      return reparsed.data;
    },
  };
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

function zeroResult(exit_code: 0 | 1 | 2): CliResult {
  return {
    exit_code,
    total_cached: 0,
    total_generated: 0,
    total_failed: 0,
    total_skipped_sources: 0,
    total_active_sources: 0,
  };
}

const argv1 = process.argv[1] ?? "";
if (argv1.endsWith("seed-variants-cli.ts") || argv1.endsWith("seed-variants-cli.js")) {
  runSeedVariantsCli({
    argv: process.argv.slice(2),
    env: {
      ANTHROPIC_API_KEY: process.env["ANTHROPIC_API_KEY"],
      DATABASE_URL: process.env["DATABASE_URL"],
    },
  })
    .then((result) => {
      process.exit(result.exit_code);
    })
    .catch((err: unknown) => {
      console.error("[seed:variants] failed:", err);
      process.exit(1);
    });
}
