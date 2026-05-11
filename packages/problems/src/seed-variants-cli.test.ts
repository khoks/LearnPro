import { describe, expect, it } from "vitest";
import type {
  CompleteRequest,
  CompleteResponse,
  EmbedRequest,
  EmbedResponse,
  LLMProvider,
  StreamChunk,
  ToolCallRequest,
  ToolCallResponse,
} from "@learnpro/llm";
import type { LearnProDb } from "@learnpro/db";
import { runSeedVariantsCli, type CliDeps } from "./seed-variants-cli.js";
import {
  ImplementProblemDefSchema,
  ProblemDefSchema,
  type ImplementProblemDef,
  type ProblemDef,
} from "./index.js";
import type { VariantCacheStore } from "@learnpro/agent";

// STORY-039f — CLI tests. The CLI's hard dependencies (DB, real LLM, real YAML loading)
// are stubbed via the `CliDeps` injectables so we exercise the argv-parse + env-refuse +
// progress-summary paths without standing up Postgres or making LLM calls.

const SOURCE_PYTHON: ImplementProblemDef = ImplementProblemDefSchema.parse({
  kind: "implement",
  slug: "sum-even-numbers",
  name: "Sum of even numbers",
  language: "python",
  difficulty: 2,
  track: "python-fundamentals",
  concept_tags: ["loops", "arithmetic"],
  statement: "Given a list of integers, return the sum of all even numbers.",
  starter_code: "def solve(nums):\n    pass\n",
  reference_solution: "def solve(nums):\n    return sum(n for n in nums if n % 2 == 0)\n",
  public_examples: [{ input: [1, 2, 3, 4], expected: 6 }],
  hidden_tests: [
    { input: [], expected: 0 },
    { input: [2, 4, 6], expected: 12 },
  ],
  expected_median_time_to_solve_ms: 60_000,
});

const SOURCE_TS: ImplementProblemDef = ImplementProblemDefSchema.parse({
  kind: "implement",
  slug: "reverse-string",
  name: "Reverse a string",
  language: "typescript",
  difficulty: 2,
  track: "typescript-fundamentals",
  concept_tags: ["strings"],
  statement: "Return the reversed string.",
  starter_code: "export function solve(s: string): string { return ''; }\n",
  reference_solution:
    "export function solve(s: string): string { return s.split('').reverse().join(''); }\n",
  public_examples: [{ input: "abc", expected: "cba" }],
  hidden_tests: [
    { input: "", expected: "" },
    { input: "hi", expected: "ih" },
  ],
  expected_median_time_to_solve_ms: 45_000,
});

function variantPayload(sourceSlug: string, suffix: number): Record<string, unknown> {
  return {
    kind: "implement",
    slug: `${sourceSlug}-variant-${suffix}`,
    name: `Variant ${suffix}`,
    language: "python",
    difficulty: 2,
    track: "python-fundamentals",
    concept_tags: ["loops", "arithmetic"],
    statement:
      "Given a list of integers, return the product of all odd numbers. If none, return 1.",
    starter_code: "def solve(nums):\n    pass\n",
    reference_solution:
      "def solve(nums):\n    result = 1\n    for n in nums:\n        if n % 2 != 0:\n            result *= n\n    return result\n",
    public_examples: [{ input: [1, 2, 3, 4, 5], expected: 15 }],
    hidden_tests: [
      { input: [], expected: 1 },
      { input: [1, 3, 5, 7], expected: 105 },
    ],
    expected_median_time_to_solve_ms: 60_000,
    variant_of: sourceSlug,
  };
}

function fakeLLM(responses: string[]): LLMProvider {
  let idx = 0;
  return {
    name: "fake",
    async complete(req: CompleteRequest): Promise<CompleteResponse> {
      const text = responses[Math.min(idx, responses.length - 1)] ?? "";
      idx += 1;
      return {
        text,
        model: req.model ?? "claude-haiku-4-5-20251001",
        finish_reason: "end_turn",
        usage: { input_tokens: 100, output_tokens: 200 },
      };
    },
    async *stream(_req: CompleteRequest): AsyncIterable<StreamChunk> {
      yield { delta: "", done: true };
    },
    async embed(_req: EmbedRequest): Promise<EmbedResponse> {
      return { vector: [], model: "voyage-3", usage: {} };
    },
    async toolCall(_req: ToolCallRequest): Promise<ToolCallResponse> {
      return {
        text: "",
        tool_calls: [],
        model: "fake",
        finish_reason: "end_turn",
        usage: { input_tokens: 0, output_tokens: 0 },
      };
    },
  };
}

interface InMemoryCache extends VariantCacheStore {
  rows: Array<{ source_problem_id: string; variant_def: ProblemDef }>;
}
function inMemoryCache(): InMemoryCache {
  const rows: Array<{ source_problem_id: string; variant_def: ProblemDef }> = [];
  return {
    rows,
    async list(source_problem_id: string): Promise<ProblemDef[]> {
      return rows
        .filter((r) => r.source_problem_id === source_problem_id)
        .map((r) => r.variant_def);
    },
    async insert(input): Promise<ProblemDef> {
      const reparsed = ProblemDefSchema.safeParse(input.variant_def);
      if (!reparsed.success) {
        throw new Error("cache insert: reparse failed");
      }
      rows.push({ source_problem_id: input.source_problem_id, variant_def: reparsed.data });
      return reparsed.data;
    },
  };
}

interface TestRig {
  stdout: string[];
  stderr: string[];
  cache: InMemoryCache;
  llm: LLMProvider;
  deps: CliDeps;
}

function buildRig(opts: {
  argv: ReadonlyArray<string>;
  env?: Record<string, string | undefined>;
  llmResponses?: string[];
  sources?: ImplementProblemDef[];
  problemIdMap?: Record<string, string | null>;
}): TestRig {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const cache = inMemoryCache();
  const llm = fakeLLM(opts.llmResponses ?? []);
  const sources = opts.sources ?? [SOURCE_PYTHON, SOURCE_TS];
  const problemIdMap: Record<string, string | null> = opts.problemIdMap ?? {
    [SOURCE_PYTHON.slug]: "00000000-0000-0000-0000-000000000001",
    [SOURCE_TS.slug]: "00000000-0000-0000-0000-000000000002",
  };
  // A do-nothing DB so the CLI's path that uses it (via injected resolvers) doesn't blow
  // up. None of the injected resolvers actually read from it in tests.
  const fakeDb = {} as LearnProDb;

  const deps: CliDeps = {
    argv: opts.argv,
    env: {
      ANTHROPIC_API_KEY: "test-key",
      DATABASE_URL: "postgres://test/test",
      ...opts.env,
    },
    stdout: (line) => stdout.push(line),
    stderr: (line) => stderr.push(line),
    resolveDb: async () => ({ db: fakeDb, close: async () => undefined }),
    resolveLlm: async () => llm,
    resolveSources: async (args) => {
      return sources.filter((s) => {
        if (args.source_slug !== undefined && s.slug !== args.source_slug) return false;
        if (args.language !== "all" && s.language !== args.language) return false;
        return true;
      });
    },
    resolveProblemId: async (_db, slug) => problemIdMap[slug] ?? null,
    buildCacheStore: () => cache,
  };
  return { stdout, stderr, cache, llm, deps };
}

describe("runSeedVariantsCli — STORY-039f", () => {
  it("dry-run --all-implement exits 0 and prints a summary without LLM calls", async () => {
    const rig = buildRig({
      argv: ["--dry-run", "--count", "3", "--all-implement"],
    });

    const result = await runSeedVariantsCli(rig.deps);

    expect(result.exit_code).toBe(0);
    expect(result.total_generated).toBe(0);
    expect(result.total_failed).toBe(0);
    // The summary line is the last stdout entry
    const summary = rig.stdout[rig.stdout.length - 1] ?? "";
    expect(summary).toContain("[seed:variants] summary:");
    expect(summary).toContain("generated=0");
    // The dry-run reports `would generate 3` per source (×2 sources)
    expect(rig.stdout.some((l) => l.includes("dry-run: would generate 3"))).toBe(true);
    expect(rig.cache.rows.length).toBe(0);
  });

  it("dry-run --source-slug filters to one source", async () => {
    const rig = buildRig({
      argv: ["--dry-run", "--count", "2", "--source-slug", "reverse-string"],
    });
    const result = await runSeedVariantsCli(rig.deps);

    expect(result.exit_code).toBe(0);
    expect(rig.stdout.some((l) => l.includes("reverse-string"))).toBe(true);
    expect(rig.stdout.some((l) => l.includes("sum-even-numbers"))).toBe(false);
  });

  it("dry-run --language python filters by language", async () => {
    const rig = buildRig({
      argv: ["--dry-run", "--count", "2", "--all-implement", "--language", "python"],
    });
    const result = await runSeedVariantsCli(rig.deps);

    expect(result.exit_code).toBe(0);
    expect(rig.stdout.some((l) => l.includes("sum-even-numbers"))).toBe(true);
    expect(rig.stdout.some((l) => l.includes("reverse-string"))).toBe(false);
  });

  it("non-dry-run without ANTHROPIC_API_KEY exits 2 with a clear error", async () => {
    const rig = buildRig({
      argv: ["--count", "1", "--all-implement"],
      env: { ANTHROPIC_API_KEY: "" },
    });
    const result = await runSeedVariantsCli(rig.deps);

    expect(result.exit_code).toBe(2);
    expect(rig.stderr.some((l) => l.includes("ANTHROPIC_API_KEY is not set"))).toBe(true);
  });

  it("without DATABASE_URL exits 2 with a clear error (even with --dry-run)", async () => {
    const rig = buildRig({
      argv: ["--dry-run", "--count", "1", "--all-implement"],
      env: { DATABASE_URL: "" },
    });
    const result = await runSeedVariantsCli(rig.deps);

    expect(result.exit_code).toBe(2);
    expect(rig.stderr.some((l) => l.includes("DATABASE_URL is not set"))).toBe(true);
  });

  it("unknown source slug exits 2 (no sources matched)", async () => {
    const rig = buildRig({
      argv: ["--dry-run", "--count", "1", "--source-slug", "does-not-exist"],
    });
    const result = await runSeedVariantsCli(rig.deps);

    expect(result.exit_code).toBe(2);
    expect(rig.stderr.some((l) => l.includes("no source problems matched"))).toBe(true);
  });

  it("mutually-exclusive --source-slug + --all-implement exits 2", async () => {
    const rig = buildRig({
      argv: ["--dry-run", "--source-slug", "reverse-string", "--all-implement"],
    });
    const result = await runSeedVariantsCli(rig.deps);

    expect(result.exit_code).toBe(2);
    expect(
      rig.stderr.some((l) => l.includes("mutually exclusive") || l.includes("usage")),
    ).toBe(true);
  });

  it("real (non-dry-run) generation persists variants and reports counts", async () => {
    const rig = buildRig({
      argv: ["--count", "2", "--source-slug", "sum-even-numbers"],
      llmResponses: [
        JSON.stringify(variantPayload("sum-even-numbers", 1)),
        JSON.stringify(variantPayload("sum-even-numbers", 2)),
      ],
    });
    const result = await runSeedVariantsCli(rig.deps);

    expect(result.exit_code).toBe(0);
    expect(result.total_generated).toBe(2);
    expect(result.total_failed).toBe(0);
    expect(rig.cache.rows.length).toBe(2);
    expect(rig.stdout.some((l) => l.includes("sum-even-numbers-variant-1 (ok"))).toBe(true);
  });

  it("count out of range exits 2 with a validation message", async () => {
    const rig = buildRig({
      argv: ["--dry-run", "--count", "999", "--all-implement"],
    });
    const result = await runSeedVariantsCli(rig.deps);

    expect(result.exit_code).toBe(2);
  });
});
