import { describe, expect, it, vi } from "vitest";
import type { LLMProvider } from "@learnpro/llm";
import type { ComprehensionProblemDef } from "@learnpro/problems";
import {
  ComprehensionAnswerSchema,
  ComprehensionGradeResultSchema,
  gradeComprehension,
  parseComprehensionGraderResponse,
} from "./comprehension-grade.js";

const MULTIPLE_CHOICE_PROBLEM: ComprehensionProblemDef = {
  kind: "comprehension",
  slug: "predict-x",
  name: "Predict X",
  language: "python",
  difficulty: 2,
  track: "python-fundamentals",
  concept_tags: ["control-flow"],
  statement: "What does it print?",
  starter_code: "print(1 + 2)",
  expected_median_time_to_solve_ms: 30000,
  comprehension_format: "predict_output",
  question: "What does the program print?",
  answer_format: "multiple_choice",
  multiple_choice_options: ["1", "2", "3", "4"],
  correct_answer_index: 2,
  explanation: "1 + 2 = 3.",
};

const FREE_TEXT_PROBLEM: ComprehensionProblemDef = {
  kind: "comprehension",
  slug: "reason-x",
  name: "Reason X",
  language: "python",
  difficulty: 3,
  track: "python-fundamentals",
  concept_tags: ["complexity"],
  statement: "Why is this slow?",
  starter_code: "def f(n): ...",
  expected_median_time_to_solve_ms: 50000,
  comprehension_format: "reason_property",
  question: "Why is the function slow for large n?",
  answer_format: "free_text",
  expected_answer: "Recursion recomputes overlapping subproblems exponentially.",
  explanation: "Without memoization, fib(n) has O(2^n) overlapping subproblems.",
};

function makeFakeLlm(text: string): LLMProvider {
  return {
    complete: vi.fn(async () => ({
      text,
      input_tokens: 10,
      output_tokens: 10,
      total_tokens: 20,
      model: "haiku",
      provider: "anthropic",
    })),
    stream: vi.fn(),
    embed: vi.fn(),
  } as unknown as LLMProvider;
}

describe("gradeComprehension — multiple_choice (deterministic)", () => {
  it("returns correct=true when index matches", async () => {
    const llm = makeFakeLlm("UNUSED");
    const result = await gradeComprehension({
      llm,
      user_id: "u1",
      problem: MULTIPLE_CHOICE_PROBLEM,
      answer: { kind: "multiple_choice", selected_index: 2 },
    });
    expect(result.correct).toBe(true);
    expect(result.fallback_used).toBe(false);
    expect(result.reasoning).toBe(MULTIPLE_CHOICE_PROBLEM.explanation);
    expect(result.explanation).toBe(MULTIPLE_CHOICE_PROBLEM.explanation);
    // Multiple-choice grading does not call the LLM.
    expect(llm.complete).not.toHaveBeenCalled();
  });

  it("returns correct=false when index does not match", async () => {
    const llm = makeFakeLlm("UNUSED");
    const result = await gradeComprehension({
      llm,
      user_id: "u1",
      problem: MULTIPLE_CHOICE_PROBLEM,
      answer: { kind: "multiple_choice", selected_index: 0 },
    });
    expect(result.correct).toBe(false);
    expect(result.fallback_used).toBe(false);
    expect(llm.complete).not.toHaveBeenCalled();
  });

  it("throws when answer kind doesn't match problem answer_format", async () => {
    const llm = makeFakeLlm("");
    await expect(
      gradeComprehension({
        llm,
        user_id: "u1",
        problem: MULTIPLE_CHOICE_PROBLEM,
        answer: { kind: "free_text", text: "anything" },
      }),
    ).rejects.toThrow(/does not match/);
  });
});

describe("gradeComprehension — free_text (LLM grader)", () => {
  it("returns correct=true when the grader says correct", async () => {
    const llm = makeFakeLlm(
      JSON.stringify({
        correct: true,
        reasoning: "Identifies overlapping subproblems and the exponential branching.",
      }),
    );
    const result = await gradeComprehension({
      llm,
      user_id: "u1",
      problem: FREE_TEXT_PROBLEM,
      answer: { kind: "free_text", text: "Each recursive call recomputes the same subtrees." },
    });
    expect(result.correct).toBe(true);
    expect(result.fallback_used).toBe(false);
    expect(result.reasoning).toContain("subproblems");
    expect(result.explanation).toBe(FREE_TEXT_PROBLEM.explanation);
    expect(llm.complete).toHaveBeenCalledOnce();
  });

  it("returns correct=false when the grader says incorrect", async () => {
    const llm = makeFakeLlm(
      JSON.stringify({
        correct: false,
        reasoning: "Misses the central reason about overlapping subproblems.",
      }),
    );
    const result = await gradeComprehension({
      llm,
      user_id: "u1",
      problem: FREE_TEXT_PROBLEM,
      answer: { kind: "free_text", text: "It's recursive." },
    });
    expect(result.correct).toBe(false);
    expect(result.fallback_used).toBe(false);
  });

  it("falls back to correct=false when the grader output fails to parse", async () => {
    const llm = makeFakeLlm("not json");
    const result = await gradeComprehension({
      llm,
      user_id: "u1",
      problem: FREE_TEXT_PROBLEM,
      answer: { kind: "free_text", text: "anything" },
    });
    expect(result.correct).toBe(false);
    expect(result.fallback_used).toBe(true);
    expect(result.reasoning.toLowerCase()).toContain("conservative");
    expect(result.explanation).toBe(FREE_TEXT_PROBLEM.explanation);
  });

  it("strips ```json fenced blocks before parsing", async () => {
    const llm = makeFakeLlm(
      "```json\n" + JSON.stringify({ correct: true, reasoning: "Right reasoning." }) + "\n```",
    );
    const result = await gradeComprehension({
      llm,
      user_id: "u1",
      problem: FREE_TEXT_PROBLEM,
      answer: { kind: "free_text", text: "x" },
    });
    expect(result.correct).toBe(true);
    expect(result.fallback_used).toBe(false);
  });

  it("throws when answer kind doesn't match problem answer_format", async () => {
    const llm = makeFakeLlm("");
    await expect(
      gradeComprehension({
        llm,
        user_id: "u1",
        problem: FREE_TEXT_PROBLEM,
        answer: { kind: "multiple_choice", selected_index: 0 },
      }),
    ).rejects.toThrow(/does not match/);
  });
});

describe("ComprehensionAnswerSchema", () => {
  it("accepts a valid multiple_choice payload", () => {
    expect(
      ComprehensionAnswerSchema.safeParse({ kind: "multiple_choice", selected_index: 2 }).success,
    ).toBe(true);
  });

  it("rejects negative selected_index", () => {
    expect(
      ComprehensionAnswerSchema.safeParse({ kind: "multiple_choice", selected_index: -1 }).success,
    ).toBe(false);
  });

  it("accepts a free_text payload with non-empty text", () => {
    expect(ComprehensionAnswerSchema.safeParse({ kind: "free_text", text: "hello" }).success).toBe(
      true,
    );
  });

  it("rejects an empty free_text payload", () => {
    expect(ComprehensionAnswerSchema.safeParse({ kind: "free_text", text: "" }).success).toBe(
      false,
    );
  });
});

describe("ComprehensionGradeResultSchema", () => {
  it("accepts the expected shape", () => {
    expect(
      ComprehensionGradeResultSchema.safeParse({
        correct: true,
        reasoning: "x",
        explanation: "y",
        fallback_used: false,
      }).success,
    ).toBe(true);
  });
});

describe("parseComprehensionGraderResponse", () => {
  it("parses a clean JSON response", () => {
    const out = parseComprehensionGraderResponse(JSON.stringify({ correct: true, reasoning: "x" }));
    expect(out).toEqual({ correct: true, reasoning: "x" });
  });

  it("returns null on non-object input", () => {
    expect(parseComprehensionGraderResponse("[]")).toBeNull();
    expect(parseComprehensionGraderResponse('"foo"')).toBeNull();
  });

  it("returns null on missing fields", () => {
    expect(parseComprehensionGraderResponse('{"correct": true}')).toBeNull();
    expect(parseComprehensionGraderResponse('{"reasoning": "x"}')).toBeNull();
  });

  it("returns null on wrong field types", () => {
    expect(parseComprehensionGraderResponse('{"correct": "yes", "reasoning": "x"}')).toBeNull();
    expect(parseComprehensionGraderResponse('{"correct": true, "reasoning": ""}')).toBeNull();
  });
});
