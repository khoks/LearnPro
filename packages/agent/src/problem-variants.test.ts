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
  ProblemDefSchema,
  type ImplementProblemDef,
} from "@learnpro/problems";
import {
  PROBLEM_VARIANTS_PROMPT_VERSION,
  buildProblemVariantsSystemPrompt,
  buildProblemVariantsUserPrompt,
} from "@learnpro/prompts";
import {
  generateProblemVariant,
  parseProblemVariantResponse,
} from "./problem-variants.js";

// STORY-039 — tests cover:
//   - The `variant_of` field validates correctly through ProblemDefSchema
//   - Pure function happy path: mocked LLM returns parseable variant
//   - Self-validation rejection: invalid LLM output → empty result
//   - Drift detection: variant with mismatched language/difficulty/tags is rejected
//   - Slug pattern enforcement
//   - Retry on parse failure
//   - Forbidden-phrase test on the system prompt itself

const SOURCE_PROBLEM: ImplementProblemDef = ImplementProblemDefSchema.parse({
  kind: "implement",
  slug: "sum-even-numbers",
  name: "Sum of even numbers",
  language: "python",
  difficulty: 2,
  track: "python-fundamentals",
  concept_tags: ["loops", "arithmetic"],
  statement: "Given a list of integers, return the sum of all even numbers.",
  starter_code: "def solve(nums):\n    pass\n",
  reference_solution:
    "def solve(nums):\n    return sum(n for n in nums if n % 2 == 0)\n",
  public_examples: [{ input: [1, 2, 3, 4], expected: 6 }],
  hidden_tests: [
    { input: [], expected: 0 },
    { input: [2, 4, 6], expected: 12 },
    { input: [1, 3, 5], expected: 0 },
  ],
  expected_median_time_to_solve_ms: 60_000,
});

function validVariantPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: "implement",
    slug: "sum-even-numbers-variant-1",
    name: "Product of odd numbers",
    language: "python",
    difficulty: 2,
    track: "python-fundamentals",
    concept_tags: ["loops", "arithmetic"],
    statement:
      "Given a list of integers, return the product of all odd numbers in the list. If there are no odd numbers, return 1.",
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
    ...overrides,
  };
}

function fakeLLM(responses: string[]): LLMProvider & { calls: CompleteRequest[] } {
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

describe("ProblemDefSchema — variant_of field — STORY-039", () => {
  it("accepts a valid implement problem with variant_of", () => {
    const result = ProblemDefSchema.safeParse(validVariantPayload());
    expect(result.success).toBe(true);
    if (result.success && result.data.kind === "implement") {
      expect(result.data.variant_of).toBe("sum-even-numbers");
    }
  });

  it("accepts an implement problem WITHOUT variant_of (legacy YAMLs)", () => {
    const payload = validVariantPayload();
    delete payload.variant_of;
    const result = ProblemDefSchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success && result.data.kind === "implement") {
      expect(result.data.variant_of).toBeUndefined();
    }
  });

  it("rejects variant_of that is not a kebab-case slug", () => {
    const result = ProblemDefSchema.safeParse(
      validVariantPayload({ variant_of: "INVALID Slug" }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects empty-string variant_of", () => {
    const result = ProblemDefSchema.safeParse(validVariantPayload({ variant_of: "" }));
    expect(result.success).toBe(false);
  });
});

describe("parseProblemVariantResponse — STORY-039", () => {
  it("parses a clean JSON variant", () => {
    const text = JSON.stringify(validVariantPayload());
    const out = parseProblemVariantResponse(text, SOURCE_PROBLEM);
    expect(out).not.toBeNull();
    expect(out?.slug).toBe("sum-even-numbers-variant-1");
    expect(out?.kind).toBe("implement");
  });

  it("strips ```json fences before parsing", () => {
    const text = "```json\n" + JSON.stringify(validVariantPayload()) + "\n```";
    const out = parseProblemVariantResponse(text, SOURCE_PROBLEM);
    expect(out).not.toBeNull();
  });

  it("returns null on garbage", () => {
    expect(parseProblemVariantResponse("not json", SOURCE_PROBLEM)).toBeNull();
    expect(parseProblemVariantResponse("", SOURCE_PROBLEM)).toBeNull();
  });

  it("returns null when the variant fails Zod (missing field)", () => {
    const broken = validVariantPayload();
    delete broken.hidden_tests;
    const out = parseProblemVariantResponse(JSON.stringify(broken), SOURCE_PROBLEM);
    expect(out).toBeNull();
  });

  it("returns null when the variant changes language", () => {
    const drifted = validVariantPayload({ language: "typescript" });
    const out = parseProblemVariantResponse(JSON.stringify(drifted), SOURCE_PROBLEM);
    expect(out).toBeNull();
  });

  it("returns null when the variant changes difficulty", () => {
    const drifted = validVariantPayload({ difficulty: 4 });
    const out = parseProblemVariantResponse(JSON.stringify(drifted), SOURCE_PROBLEM);
    expect(out).toBeNull();
  });

  it("returns null when the variant changes concept_tags", () => {
    const drifted = validVariantPayload({ concept_tags: ["loops", "strings"] });
    const out = parseProblemVariantResponse(JSON.stringify(drifted), SOURCE_PROBLEM);
    expect(out).toBeNull();
  });

  it("returns null when the variant changes the track", () => {
    const drifted = validVariantPayload({ track: "typescript-fundamentals" });
    const out = parseProblemVariantResponse(JSON.stringify(drifted), SOURCE_PROBLEM);
    expect(out).toBeNull();
  });

  it("returns null when the variant changes kind to debug", () => {
    const drifted = validVariantPayload({
      kind: "debug",
      bug_archetype: "off_by_one",
      expected_behavior: "Should sum.",
    });
    const out = parseProblemVariantResponse(JSON.stringify(drifted), SOURCE_PROBLEM);
    expect(out).toBeNull();
  });

  it("returns null when the slug doesn't follow the source-prefix pattern", () => {
    const drifted = validVariantPayload({ slug: "unrelated-problem" });
    const out = parseProblemVariantResponse(JSON.stringify(drifted), SOURCE_PROBLEM);
    expect(out).toBeNull();
  });

  it("returns null when variant_of points to a different source", () => {
    const drifted = validVariantPayload({ variant_of: "other-problem" });
    const out = parseProblemVariantResponse(JSON.stringify(drifted), SOURCE_PROBLEM);
    expect(out).toBeNull();
  });

  it("accepts a variant that omits variant_of (the slug-prefix check is enough)", () => {
    const ok = validVariantPayload();
    delete ok.variant_of;
    const out = parseProblemVariantResponse(JSON.stringify(ok), SOURCE_PROBLEM);
    expect(out).not.toBeNull();
  });
});

describe("generateProblemVariant — STORY-039", () => {
  it("calls Haiku with the v1 prompt version + reflection role + correct user_id", async () => {
    const llm = fakeLLM([JSON.stringify(validVariantPayload())]);
    await generateProblemVariant({
      llm,
      user_id: "u-123",
      source: SOURCE_PROBLEM,
    });
    expect(llm.calls).toHaveLength(1);
    expect(llm.calls[0]?.role).toBe("reflection");
    expect(llm.calls[0]?.model).toMatch(/haiku/);
    expect(llm.calls[0]?.prompt_version).toBe(PROBLEM_VARIANTS_PROMPT_VERSION);
    expect(llm.calls[0]?.user_id).toBe("u-123");
  });

  it("happy path: returns a parsed variant when the LLM emits valid JSON", async () => {
    const llm = fakeLLM([JSON.stringify(validVariantPayload())]);
    const out = await generateProblemVariant({
      llm,
      user_id: "u",
      source: SOURCE_PROBLEM,
    });
    expect(out.fallback_used).toBe(false);
    expect(out.variants).toHaveLength(1);
    expect(out.variants[0]?.slug).toBe("sum-even-numbers-variant-1");
  });

  it("retries once on parse failure, succeeds on the second attempt", async () => {
    const llm = fakeLLM(["not json", JSON.stringify(validVariantPayload({ slug: "sum-even-numbers-variant-2" }))]);
    const out = await generateProblemVariant({
      llm,
      user_id: "u",
      source: SOURCE_PROBLEM,
    });
    expect(llm.calls).toHaveLength(2);
    expect(out.variants).toHaveLength(1);
    expect(out.fallback_used).toBe(false);
  });

  it("returns empty + fallback_used=true when both attempts fail", async () => {
    const llm = fakeLLM(["not json", "still not json"]);
    const out = await generateProblemVariant({
      llm,
      user_id: "u",
      source: SOURCE_PROBLEM,
    });
    expect(llm.calls).toHaveLength(2);
    expect(out.variants).toEqual([]);
    expect(out.fallback_used).toBe(true);
  });

  it("returns empty when the LLM returns a schema-failing variant on every attempt", async () => {
    const broken = validVariantPayload();
    delete broken.hidden_tests;
    const llm = fakeLLM([JSON.stringify(broken), JSON.stringify(broken)]);
    const out = await generateProblemVariant({
      llm,
      user_id: "u",
      source: SOURCE_PROBLEM,
    });
    expect(out.variants).toEqual([]);
    expect(out.fallback_used).toBe(true);
  });

  it("returns empty when the source isn't an implement problem (defensive guard)", async () => {
    const llm = fakeLLM([JSON.stringify(validVariantPayload())]);
    // Cast a shape that isn't an implement problem — comprehension/debug not supported in v1.
    const fakeSource = {
      ...SOURCE_PROBLEM,
      kind: "comprehension" as const,
    } as unknown as ImplementProblemDef;
    const out = await generateProblemVariant({
      llm,
      user_id: "u",
      source: fakeSource,
    });
    expect(llm.calls).toHaveLength(0);
    expect(out.variants).toEqual([]);
    expect(out.fallback_used).toBe(true);
  });

  it("respects an explicit model override", async () => {
    const llm = fakeLLM([JSON.stringify(validVariantPayload())]);
    await generateProblemVariant({
      llm,
      user_id: "u",
      source: SOURCE_PROBLEM,
      model: "claude-sonnet-4-5",
    });
    expect(llm.calls[0]?.model).toBe("claude-sonnet-4-5");
  });

  it("clamps count > 5 down to 5", async () => {
    // Each call returns the same variant payload with a unique slug so the dedupe doesn't
    // suppress them.
    const responses: string[] = [];
    for (let i = 1; i <= 8; i++) {
      responses.push(JSON.stringify(validVariantPayload({ slug: `sum-even-numbers-variant-${i}` })));
    }
    const llm = fakeLLM(responses);
    const out = await generateProblemVariant({
      llm,
      user_id: "u",
      source: SOURCE_PROBLEM,
      count: 99,
    });
    // Each successful generate consumes one call; clamping to 5 means at most 5 successful
    // outputs (and at most 10 calls if every first attempt parsed cleanly — here they do).
    expect(out.variants.length).toBeLessThanOrEqual(5);
  });
});

describe("problem-variants prompt — STORY-039 forbidden-phrase test", () => {
  // Coach-voice rules: no FOMO / loss-aversion / streak-shaming / coercive copy in the
  // user-facing variant statement. The system prompt sets the register; the test guards
  // against drift if the prompt is later edited.
  const FORBIDDEN_SUBSTRINGS = [
    "DON'T LOSE",
    "LOSE YOUR STREAK",
    "🔥",
    "⚠️",
    "fall behind",
    "leaderboard",
    "you've got this",
    "level up",
    "fomo",
  ];

  it("system prompt has no forbidden coach-voice phrases", () => {
    const sys = buildProblemVariantsSystemPrompt().toLowerCase();
    for (const phrase of FORBIDDEN_SUBSTRINGS) {
      expect(sys.includes(phrase.toLowerCase()), `system prompt contains "${phrase}"`).toBe(false);
    }
  });

  it("system prompt explicitly forbids motivational filler", () => {
    const sys = buildProblemVariantsSystemPrompt().toLowerCase();
    expect(sys).toContain("no motivational filler");
  });

  it("user prompt for a real source is non-empty and references the source slug", () => {
    const userPrompt = buildProblemVariantsUserPrompt({
      source: {
        slug: SOURCE_PROBLEM.slug,
        name: SOURCE_PROBLEM.name,
        language: SOURCE_PROBLEM.language,
        difficulty: SOURCE_PROBLEM.difficulty,
        track: SOURCE_PROBLEM.track,
        concept_tags: SOURCE_PROBLEM.concept_tags,
        statement: SOURCE_PROBLEM.statement,
        starter_code: SOURCE_PROBLEM.starter_code,
        reference_solution: SOURCE_PROBLEM.reference_solution,
        public_examples: SOURCE_PROBLEM.public_examples,
        hidden_tests: SOURCE_PROBLEM.hidden_tests,
        expected_median_time_to_solve_ms: SOURCE_PROBLEM.expected_median_time_to_solve_ms,
      },
      variant_index: 1,
    });
    expect(userPrompt).toContain(SOURCE_PROBLEM.slug);
    expect(userPrompt).toContain("variant-1");
  });
});
