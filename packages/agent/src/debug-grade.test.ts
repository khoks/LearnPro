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
import type { DebugProblemDef } from "@learnpro/problems";
import { describe, expect, it } from "vitest";
import { DebugGradeResultSchema, parseDebugGraderResponse, runDebugGrader } from "./debug-grade.js";

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

function debugProblem(): DebugProblemDef {
  return {
    kind: "debug",
    slug: "off-by-one-range",
    name: "Off by one — inclusive range",
    language: "python",
    difficulty: 2,
    track: "python-fundamentals",
    concept_tags: ["loops", "ranges"],
    bug_archetype: "off_by_one",
    expected_behavior: "Sum integers from 1 to n inclusive.",
    statement: "fix the buggy loop",
    starter_code: "def solve(n):\n    return sum(range(1, n))\n",
    reference_solution: "def solve(n):\n    return sum(range(1, n + 1))\n",
    public_examples: [{ input: 5, expected: 15 }],
    hidden_tests: [{ input: 5, expected: 15 }],
    expected_median_time_to_solve_ms: 60_000,
  };
}

describe("parseDebugGraderResponse", () => {
  it("parses a clean grader response", () => {
    const out = parseDebugGraderResponse(
      JSON.stringify({
        named_bug: true,
        inferred_archetype: "off_by_one",
        reasoning_was_coherent: true,
        summary: "Identified the off-by-one and corrected the inclusive range.",
      }),
    );
    expect(out?.named_bug).toBe(true);
    expect(out?.inferred_archetype).toBe("off_by_one");
    expect(out?.reasoning_was_coherent).toBe(true);
  });

  it("strips markdown fences", () => {
    const text =
      "```json\n" +
      JSON.stringify({
        named_bug: false,
        inferred_archetype: "unknown",
        reasoning_was_coherent: false,
        summary: "no narration",
      }) +
      "\n```";
    const out = parseDebugGraderResponse(text);
    expect(out?.inferred_archetype).toBe("unknown");
  });

  it("returns null on invalid shapes (caller falls back)", () => {
    expect(parseDebugGraderResponse("not json")).toBeNull();
    expect(parseDebugGraderResponse('{"named_bug": "yes"}')).toBeNull();
    expect(
      parseDebugGraderResponse(
        JSON.stringify({
          named_bug: true,
          inferred_archetype: "fictional_archetype",
          reasoning_was_coherent: true,
          summary: "x",
        }),
      ),
    ).toBeNull();
    expect(
      parseDebugGraderResponse(
        JSON.stringify({
          named_bug: true,
          inferred_archetype: "off_by_one",
          reasoning_was_coherent: true,
          summary: "",
        }),
      ),
    ).toBeNull();
  });
});

describe("runDebugGrader", () => {
  it("calls the LLM with grader role + debug prompt_version + Haiku model by default", async () => {
    const llm = fakeLlm(
      JSON.stringify({
        named_bug: true,
        inferred_archetype: "off_by_one",
        reasoning_was_coherent: true,
        summary: "Identified the off-by-one in the loop bound.",
      }),
    );
    await runDebugGrader({
      llm,
      user_id: "user-1",
      problem: debugProblem(),
      user_fix: "def solve(n):\n    return sum(range(1, n + 1))\n",
      user_explanation: "Range was exclusive — extended the upper bound.",
    });
    expect(llm.calls).toHaveLength(1);
    expect(llm.calls[0]?.role).toBe("grader");
    expect(llm.calls[0]?.model).toMatch(/haiku/);
    expect(llm.calls[0]?.prompt_version).toMatch(/^debug-grader-/);
    expect(llm.calls[0]?.user_id).toBe("user-1");
  });

  it("happy path: returns parsed verdict (fallback_used=false)", async () => {
    const llm = fakeLlm(
      JSON.stringify({
        named_bug: true,
        inferred_archetype: "off_by_one",
        reasoning_was_coherent: true,
        summary: "Identified the off-by-one upper bound and corrected the inclusive range.",
      }),
    );
    const out = await runDebugGrader({
      llm,
      user_id: "user-1",
      problem: debugProblem(),
      user_fix: "def solve(n):\n    return sum(range(1, n + 1))\n",
      user_explanation: "Range was exclusive.",
    });
    expect(out.fallback_used).toBe(false);
    expect(out.named_bug).toBe(true);
    expect(out.inferred_archetype).toBe("off_by_one");
    expect(DebugGradeResultSchema.parse(out)).toEqual(out);
  });

  it("on parse failure: falls back to named_bug=false / unknown", async () => {
    const llm = fakeLlm("not even close to JSON");
    const out = await runDebugGrader({
      llm,
      user_id: "user-1",
      problem: debugProblem(),
      user_fix: "fixed",
      user_explanation: "",
    });
    expect(out.fallback_used).toBe(true);
    expect(out.named_bug).toBe(false);
    expect(out.inferred_archetype).toBe("unknown");
    expect(out.reasoning_was_coherent).toBe(false);
  });

  it("propagates the buggy starter + user explanation into the user prompt content", async () => {
    const llm = fakeLlm(
      JSON.stringify({
        named_bug: false,
        inferred_archetype: "unknown",
        reasoning_was_coherent: false,
        summary: "ok",
      }),
    );
    await runDebugGrader({
      llm,
      user_id: "user-1",
      problem: debugProblem(),
      user_fix: "fixed code",
      user_explanation: "I narrowed the loop range.",
    });
    const userMsg = llm.calls[0]?.messages[0]?.content ?? "";
    expect(userMsg).toContain("range(1, n)"); // buggy starter
    expect(userMsg).toContain("fixed code"); // user fix
    expect(userMsg).toContain("I narrowed the loop range."); // explanation
  });

  it("renders a friendly stand-in when no explanation is provided", async () => {
    const llm = fakeLlm(
      JSON.stringify({
        named_bug: false,
        inferred_archetype: "unknown",
        reasoning_was_coherent: false,
        summary: "ok",
      }),
    );
    await runDebugGrader({
      llm,
      user_id: "user-1",
      problem: debugProblem(),
      user_fix: "fixed",
    });
    const userMsg = llm.calls[0]?.messages[0]?.content ?? "";
    expect(userMsg).toContain("(none provided)");
  });
});
