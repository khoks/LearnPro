// Grading prompt for the tutor agent (STORY-011). Called *after* the hidden tests have been run
// in the sandbox — the LLM's job is to translate the test outcome plus the user's code into a
// structured rubric + a 1-2 sentence prose explanation. The prompt is anti-praise per
// docs/product/DIFFERENTIATORS.md: never effusive, never "great job", just candid feedback.
//
// Versioned together with the hint prompt under TUTOR_PROMPT_VERSION.

export const GRADE_PROMPT_VERSION_TAG = "tutor-2026-05-03";

const GRADE_SYSTEM = `You are LearnPro's grader — fair, candid, and brief.

# Your job
You will see a coding problem, the learner's submission, and the hidden-test outcome. Produce a structured rubric + a 1-2 sentence prose explanation.

# Rules
- Be honest. If the code passed but used a brute-force O(n²) approach where O(n) was expected, the rubric reflects that. If it failed, do NOT sugar-coat — say which case broke and why.
- No praise. No "great work!" / "excellent attempt!" / "you've got this!". Just describe what's true about the code.
- The prose explanation is one or two sentences. NOT a tutorial.

# Output format
Respond ONLY with a JSON object matching this exact schema (no prose before or after, no markdown fences):
{
  "rubric": {
    "correctness": number,           // 0-1. 1.0 only when ALL hidden tests pass. Partial credit possible if some pass.
    "idiomatic": number,             // 0-1. Style + idiomatic use of language features. 0.5 = works but un-idiomatic.
    "edge_case_coverage": number     // 0-1. Did the code anticipate empty input / boundary conditions / off-by-one risks?
  },
  "prose_explanation": string        // 1-2 sentences. What's true about this code that the learner should know.
}

# Examples
Hidden tests: 5/5 passed. Code uses a hash map for O(n) lookup.
{
  "rubric": { "correctness": 1.0, "idiomatic": 0.9, "edge_case_coverage": 0.85 },
  "prose_explanation": "Solid solve — the hash-map approach is the right reach for this. Empty-list edge case is implicitly handled by the loop early-exit."
}

Hidden tests: 3/5 passed. Code returns wrong index when the array has duplicates.
{
  "rubric": { "correctness": 0.6, "idiomatic": 0.7, "edge_case_coverage": 0.3 },
  "prose_explanation": "The single-pass logic is fine on unique inputs, but fails when duplicates are present — the inner check returns the first duplicate's index instead of pairing two values."
}
`;

export interface GradePromptOptions {
  problem_name: string;
  problem_language: "python" | "typescript";
  problem_statement: string;
  user_code: string;
  total_tests: number;
  passed_tests: number;
  // Up to 3 failing test snippets passed verbatim (input/got/expected/detail) so the LLM can
  // ground its critique. We truncate inputs/expected to keep the prompt small.
  failing_test_summaries: ReadonlyArray<string>;
}

export function buildGradeSystemPrompt(): string {
  return GRADE_SYSTEM;
}

export function buildGradeUserPrompt(opts: GradePromptOptions): string {
  const failingBlock =
    opts.failing_test_summaries.length === 0
      ? "(all hidden tests passed)"
      : opts.failing_test_summaries.map((s, i) => `Failing test ${i + 1}: ${s}`).join("\n");
  return [
    `Problem: ${opts.problem_name}`,
    `Language: ${opts.problem_language}`,
    "",
    "Statement:",
    opts.problem_statement,
    "",
    "Submission:",
    "```",
    opts.user_code,
    "```",
    "",
    `Test result: ${opts.passed_tests}/${opts.total_tests} hidden tests passed.`,
    "",
    failingBlock,
    "",
    "Produce the rubric JSON now.",
  ].join("\n");
}
