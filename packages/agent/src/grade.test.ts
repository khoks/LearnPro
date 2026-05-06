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
import type { ProblemDef } from "@learnpro/problems";
import { describe, expect, it, vi } from "vitest";
import {
  GradeAgentResultSchema,
  GraderRubricSchema,
  RubricScoreSchema,
  gradeAgent,
  parseGraderResponse,
  summarizeFailing,
} from "./grade.js";

const EPISODE = { episode_id: "11111111-1111-4111-8111-111111111111", user_id: "user-1" };

function pdef(overrides: Partial<ProblemDef> = {}): ProblemDef {
  return {
    slug: "two-sum",
    name: "Two sum",
    language: "python",
    difficulty: 2,
    track: "python-fundamentals",
    concept_tags: ["arrays", "hash-map"],
    statement: "find indices of two numbers that sum to target",
    starter_code: "def solve(nums, target):\n    pass\n",
    reference_solution: "def solve(nums, target):\n    return [0, 1]\n",
    public_examples: [{ input: [[2, 7], 9], expected: [0, 1] }],
    hidden_tests: [{ input: [[2, 7], 9], expected: [0, 1] }],
    expected_median_time_to_solve_ms: 60_000,
    ...overrides,
  };
}

function fakeLlm(responseText: string): LLMProvider & { calls: CompleteRequest[] } {
  const calls: CompleteRequest[] = [];
  return {
    name: "fake",
    calls,
    async complete(req: CompleteRequest): Promise<CompleteResponse> {
      calls.push(req);
      return {
        text: responseText,
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
}

describe("RubricScoreSchema", () => {
  it("accepts integers 1 through 5", () => {
    for (const n of [1, 2, 3, 4, 5]) {
      expect(RubricScoreSchema.parse(n)).toBe(n);
    }
  });

  it("rejects 0, 6, floats, and non-numbers", () => {
    expect(() => RubricScoreSchema.parse(0)).toThrow();
    expect(() => RubricScoreSchema.parse(6)).toThrow();
    expect(() => RubricScoreSchema.parse(2.5)).toThrow();
    expect(() => RubricScoreSchema.parse("3")).toThrow();
  });
});

describe("GraderRubricSchema", () => {
  it("requires all three rubric dimensions", () => {
    expect(() =>
      GraderRubricSchema.parse({ idiomatic: 3, efficiency: 4 }),
    ).toThrow();
  });

  it("validates a fully-filled rubric", () => {
    expect(
      GraderRubricSchema.parse({ idiomatic: 4, efficiency: 5, test_coverage_thinking: 3 }),
    ).toEqual({ idiomatic: 4, efficiency: 5, test_coverage_thinking: 3 });
  });
});

describe("parseGraderResponse", () => {
  it("parses a clean grader response", () => {
    const out = parseGraderResponse(
      JSON.stringify({
        pass: true,
        rubric: { idiomatic: 5, efficiency: 4, test_coverage_thinking: 3 },
        reasoning: "Clean idiomatic solve.",
      }),
    );
    expect(out).toEqual({
      pass: true,
      rubric: { idiomatic: 5, efficiency: 4, test_coverage_thinking: 3 },
      reasoning: "Clean idiomatic solve.",
    });
  });

  it("strips markdown fences", () => {
    const text = "```json\n" +
      JSON.stringify({
        pass: false,
        rubric: { idiomatic: 2, efficiency: 1, test_coverage_thinking: 2 },
        reasoning: "O(n^2) where O(n) was expected.",
      }) +
      "\n```";
    const out = parseGraderResponse(text);
    expect(out?.pass).toBe(false);
    expect(out?.rubric.efficiency).toBe(1);
  });

  it("clamps numeric rubric scores into [1,5]", () => {
    const out = parseGraderResponse(
      JSON.stringify({
        pass: true,
        rubric: { idiomatic: 7, efficiency: 0, test_coverage_thinking: 3 },
        reasoning: "ok",
      }),
    );
    expect(out?.rubric.idiomatic).toBe(5);
    expect(out?.rubric.efficiency).toBe(1);
  });

  it("coerces stringified numbers (cheap LLM resilience)", () => {
    const out = parseGraderResponse(
      JSON.stringify({
        pass: true,
        rubric: { idiomatic: "4", efficiency: "3", test_coverage_thinking: "5" },
        reasoning: "ok",
      }),
    );
    expect(out?.rubric).toEqual({ idiomatic: 4, efficiency: 3, test_coverage_thinking: 5 });
  });

  it("returns null on invalid shapes (caller falls back)", () => {
    expect(parseGraderResponse("not json")).toBeNull();
    expect(parseGraderResponse('{"pass": true}')).toBeNull();
    expect(
      parseGraderResponse(
        JSON.stringify({ pass: "yes", rubric: { idiomatic: 3, efficiency: 3, test_coverage_thinking: 3 }, reasoning: "x" }),
      ),
    ).toBeNull();
    expect(
      parseGraderResponse(
        JSON.stringify({ pass: true, rubric: { idiomatic: 3 }, reasoning: "x" }),
      ),
    ).toBeNull();
    expect(
      parseGraderResponse(
        JSON.stringify({ pass: true, rubric: { idiomatic: 3, efficiency: 3, test_coverage_thinking: 3 }, reasoning: "" }),
      ),
    ).toBeNull();
  });
});

describe("summarizeFailing", () => {
  it("only includes failing tests, capped at 3", () => {
    const out = summarizeFailing([
      { index: 0, passed: true },
      { index: 1, passed: false, expected: 1, got: 2, detail: "mismatch" },
      { index: 2, passed: false, expected: 3, got: 4 },
      { index: 3, passed: false, expected: 5, got: 6 },
      { index: 4, passed: false, expected: 7, got: 8 },
    ]);
    expect(out).toHaveLength(3);
    expect(out[0]).toContain("mismatch");
  });

  it("returns empty array when all tests passed", () => {
    expect(
      summarizeFailing([
        { index: 0, passed: true },
        { index: 1, passed: true },
      ]),
    ).toEqual([]);
  });
});

describe("gradeAgent", () => {
  it("calls the LLM with grader role + grader prompt_version + Haiku model by default", async () => {
    const llm = fakeLlm(
      JSON.stringify({
        pass: true,
        rubric: { idiomatic: 4, efficiency: 5, test_coverage_thinking: 4 },
        reasoning: "Clean solve.",
      }),
    );
    await gradeAgent({
      llm,
      episode: EPISODE,
      code: "def solve(): return [0, 1]",
      problem: pdef(),
      test_results: [{ index: 0, passed: true }],
    });
    expect(llm.calls).toHaveLength(1);
    expect(llm.calls[0]?.role).toBe("grader");
    expect(llm.calls[0]?.model).toMatch(/haiku/);
    expect(llm.calls[0]?.prompt_version).toMatch(/^grader-/);
    expect(llm.calls[0]?.user_id).toBe("user-1");
  });

  it("happy path: returns the parsed rubric (fallback_used=false)", async () => {
    const llm = fakeLlm(
      JSON.stringify({
        pass: true,
        rubric: { idiomatic: 5, efficiency: 4, test_coverage_thinking: 3 },
        reasoning: "Solid hash-map solution.",
      }),
    );
    const out = await gradeAgent({
      llm,
      episode: EPISODE,
      code: "def solve(): return [0, 1]",
      problem: pdef(),
      test_results: [
        { index: 0, passed: true },
        { index: 1, passed: true },
      ],
    });
    expect(out.fallback_used).toBe(false);
    expect(out.pass).toBe(true);
    expect(out.rubric).toEqual({ idiomatic: 5, efficiency: 4, test_coverage_thinking: 3 });
    expect(out.reasoning).toContain("hash-map");
    expect(GradeAgentResultSchema.parse(out)).toEqual(out);
  });

  it("flags O(n^2) submissions on idiomatic + efficiency", async () => {
    const llm = fakeLlm(
      JSON.stringify({
        pass: true,
        rubric: { idiomatic: 2, efficiency: 1, test_coverage_thinking: 3 },
        reasoning: "Nested loop where a set would be O(n).",
      }),
    );
    const out = await gradeAgent({
      llm,
      episode: EPISODE,
      code: "for i in range(n):\n  for j in range(i+1,n):\n    ...",
      problem: pdef(),
      test_results: [
        { index: 0, passed: true },
        { index: 1, passed: true },
      ],
    });
    expect(out.pass).toBe(true);
    expect(out.rubric.idiomatic).toBeLessThanOrEqual(2);
    expect(out.rubric.efficiency).toBeLessThanOrEqual(2);
  });

  it("on parse failure: falls back to neutral rubric, pass mirrors tests-as-floor", async () => {
    const llm = fakeLlm("not even close to JSON");
    const out = await gradeAgent({
      llm,
      episode: EPISODE,
      code: "code",
      problem: pdef(),
      test_results: [
        { index: 0, passed: true },
        { index: 1, passed: true },
      ],
    });
    expect(out.fallback_used).toBe(true);
    expect(out.rubric).toEqual({ idiomatic: 3, efficiency: 3, test_coverage_thinking: 3 });
    expect(out.pass).toBe(true);
    expect(out.reasoning).toMatch(/2\/2/);
  });

  it("on parse failure with failing tests: pass=false in fallback (tests-as-floor wins)", async () => {
    const llm = fakeLlm("");
    const out = await gradeAgent({
      llm,
      episode: EPISODE,
      code: "code",
      problem: pdef(),
      test_results: [
        { index: 0, passed: true },
        { index: 1, passed: false, detail: "mismatch", expected: 1, got: 2 },
      ],
    });
    expect(out.fallback_used).toBe(true);
    expect(out.pass).toBe(false);
  });

  it("propagates failing test summaries into the user prompt content", async () => {
    const llm = fakeLlm(
      JSON.stringify({
        pass: false,
        rubric: { idiomatic: 3, efficiency: 3, test_coverage_thinking: 1 },
        reasoning: "Edge case missed.",
      }),
    );
    await gradeAgent({
      llm,
      episode: EPISODE,
      code: "code",
      problem: pdef(),
      test_results: [
        { index: 0, passed: false, detail: "duplicate-mismatch", expected: 1, got: 2 },
      ],
    });
    const userMsg = llm.calls[0]?.messages[0]?.content ?? "";
    expect(userMsg).toContain("duplicate-mismatch");
    expect(userMsg).toContain("0/1");
  });

  it("respects the model override", async () => {
    const llm = fakeLlm(
      JSON.stringify({
        pass: true,
        rubric: { idiomatic: 3, efficiency: 3, test_coverage_thinking: 3 },
        reasoning: "ok",
      }),
    );
    await gradeAgent({
      llm,
      episode: EPISODE,
      code: "code",
      problem: pdef(),
      test_results: [{ index: 0, passed: true }],
      model: "claude-opus-4-7",
    });
    expect(llm.calls[0]?.model).toBe("claude-opus-4-7");
  });
});
