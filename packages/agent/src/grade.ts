// STORY-034 — split critique/grader agent.
//
// `gradeAgent` is a pure function: given an LLM, an episode context, the submitted code, and the
// problem definition, it builds the grader prompt, calls the LLM with the cooler-toned grader
// system prompt, and returns the validated rubric. It deliberately does NOT depend on a sandbox or
// a DB — it scores AFTER the tests-as-floor pass/fail check has already run upstream.
//
// Design intent (per STORY-034):
//   - Split the warm tutor from the candid grader. The grader scores rubric dimensions on a 1-5
//     integer scale (idiomatic / efficiency / test_coverage_thinking) plus pass + reasoning.
//   - Use Haiku — cheaper, fine for rubric-following.
//   - Zod-validate the LLM output. On parse failure, treat as a pass-with-warning: surface a
//     synthetic conservative rubric and let the user proceed. NEVER block them on grader hiccups.

import type { LLMProvider } from "@learnpro/llm";
import { ANTHROPIC_HAIKU } from "@learnpro/llm";
import {
  GRADE_PROMPT_VERSION,
  buildGradeAgentSystemPrompt,
  buildGradeAgentUserPrompt,
} from "@learnpro/prompts";
import type { ProblemDef } from "@learnpro/problems";
import { z } from "zod";
import type { HiddenTestResult } from "./ports.js";

export const RubricScoreSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);
export type RubricScore = z.infer<typeof RubricScoreSchema>;

export const GraderRubricSchema = z.object({
  idiomatic: RubricScoreSchema,
  efficiency: RubricScoreSchema,
  test_coverage_thinking: RubricScoreSchema,
});
export type GraderRubric = z.infer<typeof GraderRubricSchema>;

export const GradeAgentResultSchema = z.object({
  pass: z.boolean(),
  rubric: GraderRubricSchema,
  reasoning: z.string().min(1),
  // True when the grader's LLM output failed to parse and we fell back to a synthetic
  // conservative rubric. Surfaced on the result so callers (the tutor's commentary phase) can
  // decide whether to reference rubric specifics or stay vague.
  fallback_used: z.boolean(),
});
export type GradeAgentResult = z.infer<typeof GradeAgentResultSchema>;

export interface GradeAgentEpisode {
  episode_id: string;
  user_id: string;
}

export interface GradeAgentInput {
  llm: LLMProvider;
  episode: GradeAgentEpisode;
  code: string;
  problem: ProblemDef;
  test_results: ReadonlyArray<HiddenTestResult>;
  // Override the default Haiku model — used by tests + future operator-tunable model selection.
  model?: string;
}

export async function gradeAgent(input: GradeAgentInput): Promise<GradeAgentResult> {
  const passed_count = input.test_results.filter((r) => r.passed).length;
  const total = input.test_results.length;
  const all_pass = total > 0 && passed_count === total;
  const failing_summaries = summarizeFailing(input.test_results);

  const system = buildGradeAgentSystemPrompt();
  const user = buildGradeAgentUserPrompt({
    problem_name: input.problem.name,
    problem_language: input.problem.language,
    problem_statement: input.problem.statement,
    user_code: input.code,
    total_tests: total,
    passed_tests: passed_count,
    failing_test_summaries: failing_summaries,
  });

  const res = await input.llm.complete({
    messages: [{ role: "user", content: user }],
    system,
    model: input.model ?? ANTHROPIC_HAIKU,
    role: "grader",
    max_tokens: 500,
    temperature: 0.2,
    prompt_version: GRADE_PROMPT_VERSION,
    user_id: input.episode.user_id,
  });

  const parsed = parseGraderResponse(res.text);
  if (parsed) {
    return {
      pass: parsed.pass,
      rubric: parsed.rubric,
      reasoning: parsed.reasoning.trim(),
      fallback_used: false,
    };
  }

  return fallbackResult({ all_pass, passed_count, total });
}

// Exported for tests. Lenient parser: strips fenced blocks, accepts numeric strings, clamps
// 1-5, swallows extras. Returns null when the shape is hopelessly off and the caller should
// surface the conservative fallback.
export function parseGraderResponse(text: string): {
  pass: boolean;
  rubric: GraderRubric;
  reasoning: string;
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
  const passVal = obj["pass"];
  const reasoningVal = obj["reasoning"];
  const rubricVal = obj["rubric"];
  if (typeof passVal !== "boolean") return null;
  if (typeof reasoningVal !== "string" || reasoningVal.trim().length === 0) return null;
  if (!rubricVal || typeof rubricVal !== "object") return null;
  const r = rubricVal as Record<string, unknown>;
  const idiomatic = coerceRubricScore(r["idiomatic"]);
  const efficiency = coerceRubricScore(r["efficiency"]);
  const test_coverage_thinking = coerceRubricScore(r["test_coverage_thinking"]);
  if (idiomatic === null || efficiency === null || test_coverage_thinking === null) return null;
  return {
    pass: passVal,
    rubric: { idiomatic, efficiency, test_coverage_thinking },
    reasoning: reasoningVal,
  };
}

function coerceRubricScore(v: unknown): RubricScore | null {
  let n: number;
  if (typeof v === "number") n = v;
  else if (typeof v === "string") {
    const parsed = Number(v.trim());
    if (!Number.isFinite(parsed)) return null;
    n = parsed;
  } else return null;
  const rounded = Math.round(n);
  if (rounded < 1) return 1;
  if (rounded > 5) return 5;
  if (rounded === 1 || rounded === 2 || rounded === 3 || rounded === 4 || rounded === 5) {
    return rounded;
  }
  return null;
}

export function summarizeFailing(results: ReadonlyArray<HiddenTestResult>): string[] {
  return results
    .filter((r) => !r.passed)
    .slice(0, 3)
    .map((r) => {
      const expected = JSON.stringify(r.expected);
      const got = JSON.stringify(r.got);
      const detail = r.detail ?? "mismatch";
      return `${detail}; expected=${truncate(expected, 200)} got=${truncate(got, 200)}`;
    });
}

// Conservative fallback: surface a "3 across the board" rubric (workmanlike, no judgement) and
// say the grader couldn't score. Pass mirrors tests-as-floor so the user is never blocked.
function fallbackResult(args: {
  all_pass: boolean;
  passed_count: number;
  total: number;
}): GradeAgentResult {
  return {
    pass: args.all_pass,
    rubric: { idiomatic: 3, efficiency: 3, test_coverage_thinking: 3 },
    reasoning:
      args.total === 0
        ? "Grader produced no rubric output; defaulting to neutral scores."
        : `Grader produced no parsable rubric; defaulting to neutral scores. ${args.passed_count}/${args.total} hidden tests passed.`,
    fallback_used: true,
  };
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
