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
import {
  ImplementProblemDefSchema,
  type ImplementProblemDef,
  type ProblemDef,
} from "@learnpro/problems";
import {
  SEED_VARIANTS_MAX_TARGET_COUNT,
  seedVariantsForProblem,
  type VariantCacheStore,
} from "./seed-variants.js";

// STORY-039f — tests for the batch-helper that drives the seeding CLI. The agent itself is
// covered in `problem-variants.test.ts`; here we exercise the cache-aware top-up wrapper
// with a stubbed LLM + in-memory `VariantCacheStore`.

const SOURCE: ImplementProblemDef = ImplementProblemDefSchema.parse({
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
    { input: [1, 3, 5], expected: 0 },
  ],
  expected_median_time_to_solve_ms: 60_000,
});

const SOURCE_PROBLEM_ID = "00000000-0000-0000-0000-000000000001";

function validVariantPayload(slugSuffix: number): Record<string, unknown> {
  return {
    kind: "implement",
    slug: `sum-even-numbers-variant-${slugSuffix}`,
    name: `Variant ${slugSuffix}`,
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
      { input: [2, 4, 6], expected: 1 },
      { input: [1, 3, 5, 7], expected: 105 },
    ],
    expected_median_time_to_solve_ms: 60_000,
    variant_of: "sum-even-numbers",
  };
}

interface FakeLLM extends LLMProvider {
  calls: CompleteRequest[];
}

// Returns an LLM stub that emits `responses[i]` for the i-th `complete()` call. Subsequent
// calls past the end return the last response (matching the existing pattern in
// problem-variants.test.ts).
function fakeLLM(responses: string[]): FakeLLM {
  const calls: CompleteRequest[] = [];
  let idx = 0;
  return {
    name: "fake",
    calls,
    async complete(req: CompleteRequest): Promise<CompleteResponse> {
      calls.push(req);
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

function inMemoryCache(seed: ProblemDef[] = []): InMemoryCache {
  const rows: Array<{ source_problem_id: string; variant_def: ProblemDef }> = seed.map((d) => ({
    source_problem_id: SOURCE_PROBLEM_ID,
    variant_def: d,
  }));
  return {
    rows,
    async list(source_problem_id: string): Promise<ProblemDef[]> {
      return rows
        .filter((r) => r.source_problem_id === source_problem_id)
        .map((r) => r.variant_def);
    },
    async insert(input): Promise<ProblemDef> {
      rows.push({
        source_problem_id: input.source_problem_id,
        variant_def: input.variant_def,
      });
      return input.variant_def;
    },
  };
}

describe("seedVariantsForProblem — STORY-039f", () => {
  it("calls the LLM `targetCount` times when the cache is empty", async () => {
    const llm = fakeLLM([
      JSON.stringify(validVariantPayload(1)),
      JSON.stringify(validVariantPayload(2)),
      JSON.stringify(validVariantPayload(3)),
    ]);
    const cache = inMemoryCache();

    const result = await seedVariantsForProblem({
      llm,
      sourceProblem: SOURCE,
      sourceProblemId: SOURCE_PROBLEM_ID,
      targetCount: 3,
      cache,
    });

    expect(result.generated).toBe(3);
    expect(result.cached).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.would_generate).toBeUndefined();
    expect(llm.calls.length).toBe(3);
    expect(cache.rows.length).toBe(3);
  });

  it("calls the LLM only for missing slots when the cache is partially full", async () => {
    const seedDef = JSON.parse(JSON.stringify(validVariantPayload(99)));
    const cache = inMemoryCache([seedDef as ProblemDef, seedDef as ProblemDef]);
    // Inject 2 cached variants with distinct slugs by swapping the slug
    cache.rows[1] = {
      source_problem_id: SOURCE_PROBLEM_ID,
      variant_def: JSON.parse(JSON.stringify(validVariantPayload(98))) as ProblemDef,
    };

    const llm = fakeLLM([JSON.stringify(validVariantPayload(1))]);

    const result = await seedVariantsForProblem({
      llm,
      sourceProblem: SOURCE,
      sourceProblemId: SOURCE_PROBLEM_ID,
      targetCount: 3,
      cache,
    });

    expect(result.generated).toBe(1);
    expect(result.cached).toBe(2);
    expect(result.failed).toBe(0);
    expect(llm.calls.length).toBe(1);
    expect(cache.rows.length).toBe(3);
  });

  it("short-circuits when the cache already has >= targetCount variants", async () => {
    const cache = inMemoryCache([
      JSON.parse(JSON.stringify(validVariantPayload(1))) as ProblemDef,
      JSON.parse(JSON.stringify(validVariantPayload(2))) as ProblemDef,
      JSON.parse(JSON.stringify(validVariantPayload(3))) as ProblemDef,
      JSON.parse(JSON.stringify(validVariantPayload(4))) as ProblemDef,
      JSON.parse(JSON.stringify(validVariantPayload(5))) as ProblemDef,
    ]);
    const llm = fakeLLM([JSON.stringify(validVariantPayload(99))]);

    const skipped: Array<{ source_slug: string; cached: number; target: number }> = [];
    const result = await seedVariantsForProblem({
      llm,
      sourceProblem: SOURCE,
      sourceProblemId: SOURCE_PROBLEM_ID,
      targetCount: 3,
      cache,
      onProgress: {
        skipped: (e) => skipped.push(e),
      },
    });

    expect(result.generated).toBe(0);
    expect(result.cached).toBe(5);
    expect(result.failed).toBe(0);
    expect(llm.calls.length).toBe(0);
    expect(cache.rows.length).toBe(5);
    expect(skipped.length).toBe(1);
    expect(skipped[0]?.cached).toBe(5);
  });

  it("dryRun: true skips all LLM and DB writes and reports `would_generate`", async () => {
    const llm = fakeLLM([JSON.stringify(validVariantPayload(1))]);
    const cache = inMemoryCache([
      JSON.parse(JSON.stringify(validVariantPayload(99))) as ProblemDef,
    ]);

    const result = await seedVariantsForProblem({
      llm,
      sourceProblem: SOURCE,
      sourceProblemId: SOURCE_PROBLEM_ID,
      targetCount: 4,
      cache,
      dryRun: true,
    });

    expect(result.generated).toBe(0);
    expect(result.cached).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.would_generate).toBe(3);
    expect(llm.calls.length).toBe(0);
    expect(cache.rows.length).toBe(1);
  });

  it("dryRun: true short-circuit reports cached count when no work needed", async () => {
    const cache = inMemoryCache([
      JSON.parse(JSON.stringify(validVariantPayload(1))) as ProblemDef,
      JSON.parse(JSON.stringify(validVariantPayload(2))) as ProblemDef,
    ]);
    const llm = fakeLLM([JSON.stringify(validVariantPayload(99))]);

    const result = await seedVariantsForProblem({
      llm,
      sourceProblem: SOURCE,
      sourceProblemId: SOURCE_PROBLEM_ID,
      targetCount: 2,
      cache,
      dryRun: true,
    });

    expect(result.generated).toBe(0);
    expect(result.cached).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.would_generate).toBeUndefined();
    expect(llm.calls.length).toBe(0);
  });

  it("counts failed slots when the agent returns empty", async () => {
    // Agent retries once on parse fail then drops — so we need 2 garbage responses per slot
    // to force one slot to fail. Two slots × 2 attempts = 4 garbage responses, plus one
    // good response that proves the third slot succeeds.
    const llm = fakeLLM([
      "not-json",
      "not-json-either",
      "still-not-json",
      "ugh",
      JSON.stringify(validVariantPayload(1)),
    ]);
    const cache = inMemoryCache();

    const failures: Array<{ source_slug: string; attempt: number; reason: string }> = [];
    const generated: Array<{ source_slug: string; slug: string; attempt: number }> = [];
    const result = await seedVariantsForProblem({
      llm,
      sourceProblem: SOURCE,
      sourceProblemId: SOURCE_PROBLEM_ID,
      targetCount: 3,
      cache,
      onProgress: {
        failed: (e) => failures.push(e),
        generated: (e) => generated.push(e),
      },
    });

    expect(result.generated).toBe(1);
    expect(result.failed).toBe(2);
    expect(result.cached).toBe(0);
    expect(cache.rows.length).toBe(1);
    expect(failures.length).toBe(2);
    expect(generated.length).toBe(1);
  });

  it("treats duplicate slugs as failures (cache-safety)", async () => {
    // Both LLM calls return a variant with the same slug. The first slot accepts it; the
    // second slot's agent call returns the same slug and the batch helper's cross-slot
    // `usedSlugs` set rejects it as a duplicate. Two LLM calls total — the agent doesn't
    // retry on this path (each slot is a fresh `generateProblemVariant` call so the
    // agent's internal usedSlugs is empty each time; the dedupe lives in the wrapper).
    const same = JSON.stringify(validVariantPayload(1));
    const llm = fakeLLM([same, same]);
    const cache = inMemoryCache();

    const result = await seedVariantsForProblem({
      llm,
      sourceProblem: SOURCE,
      sourceProblemId: SOURCE_PROBLEM_ID,
      targetCount: 2,
      cache,
    });

    expect(result.generated).toBe(1);
    expect(result.failed).toBe(1);
    expect(cache.rows.length).toBe(1);
  });

  it("clamps targetCount to MAX_TARGET_COUNT", async () => {
    expect(SEED_VARIANTS_MAX_TARGET_COUNT).toBe(20);
    // Cache pre-filled with MAX_TARGET_COUNT cached variants so the helper short-circuits
    // — we just want to assert the clamp by checking that no LLM call fires when
    // requesting a huge number.
    const seeds: ProblemDef[] = [];
    for (let i = 1; i <= SEED_VARIANTS_MAX_TARGET_COUNT; i++) {
      seeds.push(JSON.parse(JSON.stringify(validVariantPayload(i))) as ProblemDef);
    }
    const cache = inMemoryCache(seeds);
    const llm = fakeLLM([JSON.stringify(validVariantPayload(999))]);

    const result = await seedVariantsForProblem({
      llm,
      sourceProblem: SOURCE,
      sourceProblemId: SOURCE_PROBLEM_ID,
      targetCount: 9999,
      cache,
    });

    expect(result.generated).toBe(0);
    expect(result.cached).toBe(SEED_VARIANTS_MAX_TARGET_COUNT);
    expect(llm.calls.length).toBe(0);
  });

  it("never throws on agent errors — counts them as failed", async () => {
    const throwingLlm: FakeLLM = {
      ...fakeLLM([]),
      async complete(_req: CompleteRequest): Promise<CompleteResponse> {
        throw new Error("upstream boom");
      },
    };
    const cache = inMemoryCache();

    const failures: Array<{ source_slug: string; attempt: number; reason: string }> = [];
    const result = await seedVariantsForProblem({
      llm: throwingLlm,
      sourceProblem: SOURCE,
      sourceProblemId: SOURCE_PROBLEM_ID,
      targetCount: 2,
      cache,
      onProgress: {
        failed: (e) => failures.push(e),
      },
    });

    expect(result.generated).toBe(0);
    expect(result.failed).toBe(2);
    expect(cache.rows.length).toBe(0);
    expect(failures.length).toBe(2);
  });
});
