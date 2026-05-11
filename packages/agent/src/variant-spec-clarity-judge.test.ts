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
import { VARIANT_SPEC_CLARITY_PROMPT_VERSION } from "@learnpro/prompts";
import {
  parseVariantSpecClarityResponse,
  runVariantSpecClarityJudge,
  VARIANT_SPEC_CLARITY_MIN_PASSING,
} from "./variant-spec-clarity-judge.js";

// STORY-039d — tests cover:
//   - Pure parser: clean JSON / fenced JSON / garbage / schema-failing / out-of-range scores
//   - Pass/fail computation: min(scores) >= 3
//   - runVariantSpecClarityJudge happy path: prompt version, model, role, user_id wiring
//   - One failing score → pass:false
//   - Malformed first response → single retry → pass on second attempt
//   - Persistent malformed response → pass:false (best-effort synthetic result)
//   - Transient LLM error → retry → synthetic failure if still failing
//   - Non-implement variant → fails soft (synthetic failure, no LLM call)

const VALID_VARIANT: ImplementProblemDef = ImplementProblemDefSchema.parse({
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
    { input: [1, 3, 5], expected: 15 },
  ],
  expected_median_time_to_solve_ms: 60_000,
  variant_of: "sum-even-numbers",
});

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
        usage: { input_tokens: 200, output_tokens: 80 },
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

function failingLLM(error: Error): LLMProvider {
  return {
    name: "failing",
    async complete(_req: CompleteRequest): Promise<CompleteResponse> {
      throw error;
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

function judgePayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    instruction_clarity: 5,
    example_quality: 4,
    concept_match: 5,
    reasoning: {
      instruction_clarity: "Statement names inputs, outputs, and empty-input behavior.",
      example_quality: "Examples cover happy path and empty input.",
      concept_match: "Reference solution iterates with a for-loop and arithmetic check.",
    },
    ...overrides,
  };
}

describe("parseVariantSpecClarityResponse — STORY-039d", () => {
  it("parses a clean JSON response with all-passing scores", () => {
    const out = parseVariantSpecClarityResponse(JSON.stringify(judgePayload()));
    expect(out).not.toBeNull();
    expect(out?.instruction_clarity).toBe(5);
    expect(out?.example_quality).toBe(4);
    expect(out?.concept_match).toBe(5);
    expect(out?.pass).toBe(true);
  });

  it("strips ```json fences before parsing", () => {
    const out = parseVariantSpecClarityResponse(
      "```json\n" + JSON.stringify(judgePayload()) + "\n```",
    );
    expect(out).not.toBeNull();
    expect(out?.pass).toBe(true);
  });

  it("strips bare ``` fences before parsing", () => {
    const out = parseVariantSpecClarityResponse("```\n" + JSON.stringify(judgePayload()) + "\n```");
    expect(out).not.toBeNull();
  });

  it("returns null on garbage", () => {
    expect(parseVariantSpecClarityResponse("not json")).toBeNull();
    expect(parseVariantSpecClarityResponse("")).toBeNull();
    expect(parseVariantSpecClarityResponse("   ")).toBeNull();
  });

  it("returns null on partial JSON (missing field)", () => {
    const partial = judgePayload();
    delete partial.example_quality;
    expect(parseVariantSpecClarityResponse(JSON.stringify(partial))).toBeNull();
  });

  it("returns null when a score is out of 1-5 range", () => {
    expect(
      parseVariantSpecClarityResponse(JSON.stringify(judgePayload({ instruction_clarity: 0 }))),
    ).toBeNull();
    expect(
      parseVariantSpecClarityResponse(JSON.stringify(judgePayload({ instruction_clarity: 6 }))),
    ).toBeNull();
  });

  it("returns null when a score isn't an integer", () => {
    expect(
      parseVariantSpecClarityResponse(JSON.stringify(judgePayload({ example_quality: 2.5 }))),
    ).toBeNull();
  });

  it("returns null when reasoning has an empty string", () => {
    const broken = judgePayload({
      reasoning: {
        instruction_clarity: "",
        example_quality: "fine",
        concept_match: "fine",
      },
    });
    expect(parseVariantSpecClarityResponse(JSON.stringify(broken))).toBeNull();
  });

  it("sets pass=true when every score >= MIN_PASSING (3)", () => {
    expect(VARIANT_SPEC_CLARITY_MIN_PASSING).toBe(3);
    const out = parseVariantSpecClarityResponse(
      JSON.stringify(
        judgePayload({ instruction_clarity: 3, example_quality: 3, concept_match: 3 }),
      ),
    );
    expect(out?.pass).toBe(true);
  });

  it("sets pass=false when instruction_clarity < 3", () => {
    const out = parseVariantSpecClarityResponse(
      JSON.stringify(judgePayload({ instruction_clarity: 2 })),
    );
    expect(out?.pass).toBe(false);
  });

  it("sets pass=false when example_quality < 3", () => {
    const out = parseVariantSpecClarityResponse(
      JSON.stringify(judgePayload({ example_quality: 1 })),
    );
    expect(out?.pass).toBe(false);
  });

  it("sets pass=false when concept_match < 3", () => {
    const out = parseVariantSpecClarityResponse(JSON.stringify(judgePayload({ concept_match: 2 })));
    expect(out?.pass).toBe(false);
  });

  it("sets pass=false even when the LLM emits a `pass: true` field (we compute it ourselves)", () => {
    // The wrapper trusts only the three integer scores; a model that tries to override the
    // computed pass flag is ignored. The response schema strips the extra field on parse.
    const out = parseVariantSpecClarityResponse(
      JSON.stringify(judgePayload({ instruction_clarity: 2, pass: true })),
    );
    expect(out?.pass).toBe(false);
  });
});

describe("runVariantSpecClarityJudge — STORY-039d", () => {
  it("calls Haiku with the v1 prompt version + reflection role + correct user_id", async () => {
    const llm = fakeLLM([JSON.stringify(judgePayload())]);
    await runVariantSpecClarityJudge({
      llm,
      user_id: "u-123",
      variant: VALID_VARIANT,
    });
    expect(llm.calls).toHaveLength(1);
    expect(llm.calls[0]?.role).toBe("reflection");
    expect(llm.calls[0]?.model).toMatch(/haiku/);
    expect(llm.calls[0]?.prompt_version).toBe(VARIANT_SPEC_CLARITY_PROMPT_VERSION);
    expect(llm.calls[0]?.user_id).toBe("u-123");
  });

  it("uses a tight max_tokens budget (rubric output is small)", async () => {
    const llm = fakeLLM([JSON.stringify(judgePayload())]);
    await runVariantSpecClarityJudge({ llm, variant: VALID_VARIANT });
    expect(llm.calls[0]?.max_tokens).toBeLessThanOrEqual(800);
  });

  it("uses temperature 0 for deterministic rubric scoring", async () => {
    const llm = fakeLLM([JSON.stringify(judgePayload())]);
    await runVariantSpecClarityJudge({ llm, variant: VALID_VARIANT });
    expect(llm.calls[0]?.temperature).toBe(0);
  });

  it("happy path: all scores >= 3 → pass:true", async () => {
    const llm = fakeLLM([JSON.stringify(judgePayload())]);
    const out = await runVariantSpecClarityJudge({ llm, variant: VALID_VARIANT });
    expect(out.pass).toBe(true);
    expect(out.instruction_clarity).toBe(5);
  });

  it("one failing score: returns pass:false without retry", async () => {
    const llm = fakeLLM([JSON.stringify(judgePayload({ instruction_clarity: 2 }))]);
    const out = await runVariantSpecClarityJudge({ llm, variant: VALID_VARIANT });
    expect(out.pass).toBe(false);
    expect(llm.calls).toHaveLength(1);
  });

  it("malformed first response: retries once, returns parsed result on second attempt", async () => {
    const llm = fakeLLM(["not json", JSON.stringify(judgePayload())]);
    const out = await runVariantSpecClarityJudge({ llm, variant: VALID_VARIANT });
    expect(llm.calls).toHaveLength(2);
    expect(out.pass).toBe(true);
  });

  it("persistent malformed responses: returns synthetic pass:false (best-effort, no throw)", async () => {
    const llm = fakeLLM(["not json", "still not json"]);
    const out = await runVariantSpecClarityJudge({ llm, variant: VALID_VARIANT });
    expect(llm.calls).toHaveLength(2);
    expect(out.pass).toBe(false);
    expect(out.instruction_clarity).toBe(1);
    expect(out.example_quality).toBe(1);
    expect(out.concept_match).toBe(1);
    expect(out.reasoning.instruction_clarity).toMatch(/did not parse/);
  });

  it("LLM throws on every attempt: returns synthetic pass:false (never throws to caller)", async () => {
    const llm = failingLLM(new Error("transient"));
    const out = await runVariantSpecClarityJudge({ llm, variant: VALID_VARIANT });
    expect(out.pass).toBe(false);
  });

  it("LLM throws once then succeeds on retry: returns the parsed result", async () => {
    let attempt = 0;
    const responses = [JSON.stringify(judgePayload())];
    const llm: LLMProvider = {
      name: "flaky",
      async complete(req: CompleteRequest): Promise<CompleteResponse> {
        attempt += 1;
        if (attempt === 1) throw new Error("simulated transient");
        return {
          text: responses[0]!,
          model: req.model ?? "claude-haiku-4-5-20251001",
          finish_reason: "end_turn",
          usage: { input_tokens: 100, output_tokens: 50 },
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
    const out = await runVariantSpecClarityJudge({ llm, variant: VALID_VARIANT });
    expect(out.pass).toBe(true);
    expect(attempt).toBe(2);
  });

  it("respects an explicit model override", async () => {
    const llm = fakeLLM([JSON.stringify(judgePayload())]);
    await runVariantSpecClarityJudge({
      llm,
      variant: VALID_VARIANT,
      model: "claude-sonnet-4-5",
    });
    expect(llm.calls[0]?.model).toBe("claude-sonnet-4-5");
  });

  it("passes the variant statement + concept_tags + examples through to the user prompt", async () => {
    const llm = fakeLLM([JSON.stringify(judgePayload())]);
    await runVariantSpecClarityJudge({ llm, variant: VALID_VARIANT });
    const userMessage = llm.calls[0]?.messages[0]?.content ?? "";
    expect(userMessage).toContain("Product of odd numbers");
    expect(userMessage).toContain("loops");
    expect(userMessage).toContain("arithmetic");
    // Hidden tests appear as JSON in the prompt — guards against the user prompt builder
    // silently dropping fields.
    expect(userMessage).toContain("Hidden tests:");
  });

  it("non-implement variant: returns synthetic pass:false WITHOUT calling the LLM", async () => {
    const llm = fakeLLM([JSON.stringify(judgePayload())]);
    // Simulate a comprehension variant by shape — out-of-scope for the judge. The cast is
    // intentional — the test exercises the runtime guard, not the type system.
    const fakeVariant = {
      ...VALID_VARIANT,
      kind: "comprehension",
    } as unknown as ProblemDef;
    const out = await runVariantSpecClarityJudge({ llm, variant: fakeVariant });
    expect(out.pass).toBe(false);
    expect(llm.calls).toHaveLength(0);
    expect(out.reasoning.instruction_clarity).toMatch(/not supported/);
  });
});
