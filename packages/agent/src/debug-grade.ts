// STORY-037 / STORY-037a — debug-exercise grader. Sister to `grade.ts` (the main rubric grader)
// and `comprehension-grade.ts`; runs ONLY when the loaded problem is `kind: "debug"`. The result
// rides alongside the main rubric — STORY-037a wires the apps/api grade-deps adapter to call this
// after the tests-as-floor pass/fail so each debug submission updates the per-archetype EWMA via
// `upsertBugFindingScore`.
//
// Best-effort discipline:
//   - Parse failure → fall back to a conservative `named_bug=false` verdict so a hiccup never
//     reports a false positive on the bug-finding axis.
//   - LLM error is the caller's problem (the deps adapter swallows; the grade tool's existing
//     try/catch around `runGraderAgent` is the analog).
//
// The function is pure. It does not depend on the DB or sandbox.

import type { LLMProvider } from "@learnpro/llm";
import { ANTHROPIC_HAIKU } from "@learnpro/llm";
import {
  DEBUG_GRADE_PROMPT_VERSION,
  buildDebugGradeSystemPrompt,
  buildDebugGradeUserPrompt,
} from "@learnpro/prompts";
import type { DebugProblemDef } from "@learnpro/problems";
import { z } from "zod";

const InferredArchetypeSchema = z.enum([
  "off_by_one",
  "mutation_in_iteration",
  "reference_equality",
  "async_race",
  "late_binding",
  "shadowing",
  "type_coercion",
  "default_arg_mutability",
  "unknown",
]);
export type InferredArchetype = z.infer<typeof InferredArchetypeSchema>;

export const DebugGradeResultSchema = z.object({
  named_bug: z.boolean(),
  inferred_archetype: InferredArchetypeSchema,
  reasoning_was_coherent: z.boolean(),
  // ONE-sentence factual third-person summary from the grader. The tutor commentary phase
  // paraphrases this warmly; we surface it raw here for persistence (mirrors the
  // STORY-034 grader.reasoning column on `episodes.rubric_reasoning`).
  summary: z.string().min(1),
  // True when the LLM output failed to parse and we fell back to a conservative
  // `named_bug=false` verdict. Surfaces so the tutor / dashboard can soften commentary.
  fallback_used: z.boolean(),
});
export type DebugGradeResult = z.infer<typeof DebugGradeResultSchema>;

export interface DebugGradeInput {
  llm: LLMProvider;
  user_id: string;
  problem: DebugProblemDef;
  // The user's submitted code (post-fix). The grader compares against `problem.starter_code`
  // (the buggy original).
  user_fix: string;
  // The user's natural-language explanation. Optional — when empty, the grader's `named_bug`
  // is almost always false (and that's the right behaviour).
  user_explanation?: string;
  // Override the default Haiku model — used by tests + future operator-tunable model selection.
  model?: string;
}

export async function runDebugGrader(input: DebugGradeInput): Promise<DebugGradeResult> {
  const system = buildDebugGradeSystemPrompt();
  const user = buildDebugGradeUserPrompt({
    problem_name: input.problem.name,
    problem_language: input.problem.language,
    expected_archetype: input.problem.bug_archetype,
    expected_behavior: input.problem.expected_behavior,
    buggy_starter: input.problem.starter_code,
    user_fix: input.user_fix,
    user_explanation: input.user_explanation ?? "",
  });

  const res = await input.llm.complete({
    messages: [{ role: "user", content: user }],
    system,
    model: input.model ?? ANTHROPIC_HAIKU,
    role: "grader",
    max_tokens: 400,
    temperature: 0.2,
    prompt_version: DEBUG_GRADE_PROMPT_VERSION,
    user_id: input.user_id,
  });

  const parsed = parseDebugGraderResponse(res.text);
  if (parsed) {
    return {
      named_bug: parsed.named_bug,
      inferred_archetype: parsed.inferred_archetype,
      reasoning_was_coherent: parsed.reasoning_was_coherent,
      summary: parsed.summary.trim(),
      fallback_used: false,
    };
  }
  return {
    named_bug: false,
    inferred_archetype: "unknown",
    reasoning_was_coherent: false,
    summary: "Debug grader produced no parsable verdict; defaulting to no recognition.",
    fallback_used: true,
  };
}

// Exported for tests. Lenient parser: strips fenced blocks, validates the four-field shape.
// Returns null when the shape is hopelessly off and the caller should surface the conservative
// fallback (named_bug=false / inferred_archetype="unknown").
export function parseDebugGraderResponse(text: string): {
  named_bug: boolean;
  inferred_archetype: InferredArchetype;
  reasoning_was_coherent: boolean;
  summary: string;
} | null {
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
  const named_bug = obj["named_bug"];
  const inferred = obj["inferred_archetype"];
  const reasoning = obj["reasoning_was_coherent"];
  const summary = obj["summary"];
  if (typeof named_bug !== "boolean") return null;
  if (typeof reasoning !== "boolean") return null;
  if (typeof summary !== "string" || summary.trim().length === 0) return null;
  const archetypeParse = InferredArchetypeSchema.safeParse(inferred);
  if (!archetypeParse.success) return null;
  return {
    named_bug,
    inferred_archetype: archetypeParse.data,
    reasoning_was_coherent: reasoning,
    summary,
  };
}
