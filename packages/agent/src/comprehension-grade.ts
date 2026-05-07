// STORY-038 — comprehension-exercise grader.
//
// `gradeComprehension` produces a per-submission verdict for a comprehension problem. Two paths
// based on `answer_format`:
//
//   - "multiple_choice" — deterministic. The user's `selected_index` is matched against the
//     problem's `correct_answer_index`. No LLM call. The reasoning is a static string from the
//     YAML's `explanation` field — surfaced verbatim by the tutor's commentary phase.
//
//   - "free_text" — LLM rubric grader. Builds the comprehension grade prompt (see
//     `@learnpro/prompts/comprehension-grade-prompt`), calls Haiku, and Zod-parses the JSON
//     response. On parse failure: fall back to a conservative "uncertain" verdict with `correct =
//     false` (the tests-as-floor analog — never block the user, but don't reward an answer the
//     grader couldn't validate).
//
// The function is pure. It does not depend on the DB or sandbox. The tutor wires it in alongside
// the existing grade path; multiple-choice grading short-circuits inside `assignment-aware`
// callers.

import type { LLMProvider } from "@learnpro/llm";
import { ANTHROPIC_HAIKU } from "@learnpro/llm";
import {
  COMPREHENSION_GRADE_PROMPT_VERSION,
  buildComprehensionGradeSystemPrompt,
  buildComprehensionGradeUserPrompt,
} from "@learnpro/prompts";
import type { ComprehensionProblemDef } from "@learnpro/problems";
import { z } from "zod";

export const ComprehensionAnswerSchema = z.union([
  z.object({
    kind: z.literal("multiple_choice"),
    selected_index: z.number().int().min(0),
  }),
  z.object({
    kind: z.literal("free_text"),
    text: z.string().min(1),
  }),
]);
export type ComprehensionAnswer = z.infer<typeof ComprehensionAnswerSchema>;

export const ComprehensionGradeResultSchema = z.object({
  correct: z.boolean(),
  // Tutor-facing prose explaining the *why* of the correct answer. For multiple-choice this is the
  // problem's `explanation` verbatim; for free-text it's the grader's reasoning sentence.
  reasoning: z.string().min(1),
  // The problem's authored explanation — passed through so the tutor's commentary phase can quote
  // it on a correct answer ("here's why") without a second prompt round-trip.
  explanation: z.string().min(1),
  // True when the LLM grader's output failed to parse and we fell back to a conservative
  // "incorrect" verdict. Multiple-choice grading never sets this. Surfaced so the tutor can
  // soften commentary when the verdict was conservative.
  fallback_used: z.boolean(),
});
export type ComprehensionGradeResult = z.infer<typeof ComprehensionGradeResultSchema>;

export interface ComprehensionGradeInput {
  llm: LLMProvider;
  user_id: string;
  problem: ComprehensionProblemDef;
  answer: ComprehensionAnswer;
  // Override the default Haiku model — used by tests + future operator-tunable model selection.
  model?: string;
}

export async function gradeComprehension(
  input: ComprehensionGradeInput,
): Promise<ComprehensionGradeResult> {
  const parsedAnswer = ComprehensionAnswerSchema.parse(input.answer);
  const problem = input.problem;

  if (parsedAnswer.kind === "multiple_choice") {
    if (problem.answer_format !== "multiple_choice") {
      throw new Error(
        `comprehension answer kind=multiple_choice does not match problem answer_format=${problem.answer_format}`,
      );
    }
    if (problem.correct_answer_index === undefined) {
      throw new Error("multiple_choice problem missing correct_answer_index");
    }
    const correct = parsedAnswer.selected_index === problem.correct_answer_index;
    return {
      correct,
      reasoning: problem.explanation,
      explanation: problem.explanation,
      fallback_used: false,
    };
  }

  if (problem.answer_format !== "free_text") {
    throw new Error(
      `comprehension answer kind=free_text does not match problem answer_format=${problem.answer_format}`,
    );
  }
  if (problem.expected_answer === undefined) {
    throw new Error("free_text problem missing expected_answer");
  }

  const system = buildComprehensionGradeSystemPrompt();
  const user = buildComprehensionGradeUserPrompt({
    problem_name: problem.name,
    problem_language: problem.language,
    starter_code: problem.starter_code,
    question: problem.question,
    expected_answer: problem.expected_answer,
    user_answer: parsedAnswer.text,
  });

  const res = await input.llm.complete({
    messages: [{ role: "user", content: user }],
    system,
    model: input.model ?? ANTHROPIC_HAIKU,
    role: "grader",
    max_tokens: 400,
    temperature: 0.2,
    prompt_version: COMPREHENSION_GRADE_PROMPT_VERSION,
    user_id: input.user_id,
  });

  const parsed = parseComprehensionGraderResponse(res.text);
  if (parsed) {
    return {
      correct: parsed.correct,
      reasoning: parsed.reasoning.trim(),
      explanation: problem.explanation,
      fallback_used: false,
    };
  }
  return {
    correct: false,
    reasoning: "Grader produced no parsable verdict; defaulting to conservative incorrect.",
    explanation: problem.explanation,
    fallback_used: true,
  };
}

// Exported for tests. Lenient parser: strips fenced blocks, accepts the two-field shape
// `{ correct, reasoning }`. Returns null when the shape is hopelessly off and the caller should
// surface the conservative fallback.
export function parseComprehensionGraderResponse(
  text: string,
): { correct: boolean; reasoning: string } | null {
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  let raw: unknown;
  try {
    raw = JSON.parse(stripped);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const correctVal = obj["correct"];
  const reasoningVal = obj["reasoning"];
  if (typeof correctVal !== "boolean") return null;
  if (typeof reasoningVal !== "string" || reasoningVal.trim().length === 0) return null;
  return { correct: correctVal, reasoning: reasoningVal };
}
