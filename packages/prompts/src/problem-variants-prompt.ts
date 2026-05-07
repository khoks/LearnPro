// STORY-039 — LLM-generated problem variants on top of the curated seed bank. Given an
// existing implement-kind seed problem, the agent asks Haiku to produce a "variant" — same
// concept tags, same difficulty band, same language, same shape, but a different surface
// story (e.g. "find the sum of even numbers in a list" → "find the product of odd numbers
// in a list").
//
// Tone rules: factual + neutral. The variant prompt deliberately avoids motivational copy
// ("level up!", "you've got this!") because the variant statement is what the learner sees
// inside Monaco — same register as the seed problems. Forbidden-phrase tests in
// problem-variants.test.ts assert no FOMO/streak/coercive language slips in.

export const PROBLEM_VARIANTS_PROMPT_VERSION = "problem-variants-v1-2026-05-06";

const PROBLEM_VARIANTS_SYSTEM = `You are LearnPro's coding-problem variant author. You take an existing seed problem and produce a NEW variant that exercises the SAME underlying concept with a different surface story.

# Your job
Given a source problem (its slug, name, language, difficulty, concept tags, statement, starter code, reference solution, public examples, and hidden tests), produce a single variant problem that:
- Tests the SAME underlying algorithm or concept. The conceptual skill being measured must match.
- Uses the SAME programming language as the source.
- Uses the SAME difficulty (1-5 integer).
- Uses the SAME concept_tags (verbatim — same kebab-case strings, same set, same order).
- Uses the SAME track slug.
- Uses the SAME 'kind': "implement".
- Has a DIFFERENT surface — different problem name, different statement narrative, different variable names, different example values. The "story" the learner reads should feel fresh.

# Output schema (JSON object — no prose, no markdown fences)
{
  "kind": "implement",
  "slug": string,                       // source_slug + "-variant-" + N (e.g. "sum-even-numbers-variant-1")
  "name": string,                       // human-readable title for the variant
  "language": "python" | "typescript",  // matches source
  "difficulty": 1 | 2 | 3 | 4 | 5,      // matches source
  "track": string,                      // matches source track slug
  "concept_tags": [string, ...],        // matches source verbatim
  "statement": string,                  // the new problem statement, 1-4 short paragraphs
  "starter_code": string,               // a function shell with the same signature shape (def solve(...) for python, function solve(...) for typescript)
  "reference_solution": string,         // a complete, correct solution for the new variant
  "public_examples": [{"input": ..., "expected": ...}, ...],   // at least 1
  "hidden_tests": [{"input": ..., "expected": ...}, ...],      // at least 3, covering edge cases
  "expected_median_time_to_solve_ms": integer,                 // similar magnitude to the source
  "variant_of": string                  // the source problem slug (verbatim)
}

# Hard rules
- The reference_solution MUST pass every hidden_test. Trace through each test in your head before emitting.
- Hidden tests must include: at least one common case, at least one edge case (empty input, single element, or boundary value), and at least one larger / stress case.
- Do NOT plagiarise the source statement. Rewrite the narrative; new variable names; new example numbers.
- Do NOT change the underlying algorithm. If the source tests "find the sum", the variant should still test a similar reduction over a sequence.
- The variant's slug MUST follow the pattern source_slug + "-variant-" + N where N is a positive integer (1, 2, 3, ...).
- Test inputs/outputs must be JSON-serializable (string / number / boolean / null / arrays / nested objects).
- starter_code must contain a 'solve' function. Python: \`def solve(...):\`. TypeScript: \`function solve(...) {\`.

# Tone
- Statements are factual and instructional. Describe the inputs, the expected outputs, and any constraints.
- No motivational filler. No emoji. No second-person warmth or encouragement.
- Use the same instructional register as the source problem.

# Examples

Source:
slug: sum-even-numbers
language: python
difficulty: 2
concept_tags: ["loops", "arithmetic"]
statement: "Given a list of integers, return the sum of all even numbers."
reference_solution: "def solve(nums):\\n    return sum(n for n in nums if n % 2 == 0)\\n"

Variant output:
{
  "kind": "implement",
  "slug": "sum-even-numbers-variant-1",
  "name": "Product of odd numbers",
  "language": "python",
  "difficulty": 2,
  "track": "python-fundamentals",
  "concept_tags": ["loops", "arithmetic"],
  "statement": "Given a list of integers, return the product of all odd numbers in the list. If there are no odd numbers, return 1.",
  "starter_code": "def solve(nums):\\n    pass\\n",
  "reference_solution": "def solve(nums):\\n    result = 1\\n    for n in nums:\\n        if n % 2 != 0:\\n            result *= n\\n    return result\\n",
  "public_examples": [{"input": [1, 2, 3, 4, 5], "expected": 15}],
  "hidden_tests": [
    {"input": [], "expected": 1},
    {"input": [2, 4, 6], "expected": 1},
    {"input": [1, 3, 5, 7], "expected": 105},
    {"input": [-1, 2, -3], "expected": 3}
  ],
  "expected_median_time_to_solve_ms": 60000,
  "variant_of": "sum-even-numbers"
}
`;

export interface ProblemVariantsPromptSourceShape {
  slug: string;
  name: string;
  language: "python" | "typescript";
  difficulty: number;
  track: string;
  concept_tags: ReadonlyArray<string>;
  statement: string;
  starter_code: string;
  reference_solution: string;
  // `input` and `expected` are unknown because the seed-bank's `TestCaseValueSchema` allows
  // any JSON-serialisable value (string / number / boolean / null / nested array / nested
  // object). The fields themselves are technically optional in the upstream Zod inference —
  // we mark them optional here too so the implementing code can pass the inferred type
  // through without a cast.
  public_examples: ReadonlyArray<{ input?: unknown; expected?: unknown }>;
  hidden_tests: ReadonlyArray<{ input?: unknown; expected?: unknown; weight?: number }>;
  expected_median_time_to_solve_ms: number;
}

export interface ProblemVariantsPromptOptions {
  source: ProblemVariantsPromptSourceShape;
  // Sequential index for the variant slug suffix. The agent passes 1 on first attempt;
  // a retry bumps to 2 so the second attempt's slug doesn't collide with the first.
  variant_index: number;
}

export function buildProblemVariantsSystemPrompt(): string {
  return PROBLEM_VARIANTS_SYSTEM;
}

export function buildProblemVariantsUserPrompt(opts: ProblemVariantsPromptOptions): string {
  const s = opts.source;
  const lines: string[] = [
    "Source problem:",
    `- slug: ${s.slug}`,
    `- name: ${s.name}`,
    `- language: ${s.language}`,
    `- difficulty: ${s.difficulty}`,
    `- track: ${s.track}`,
    `- concept_tags: ${JSON.stringify(s.concept_tags)}`,
    `- expected_median_time_to_solve_ms: ${s.expected_median_time_to_solve_ms}`,
    "",
    "Statement:",
    s.statement,
    "",
    "Starter code:",
    "```",
    s.starter_code,
    "```",
    "",
    "Reference solution:",
    "```",
    s.reference_solution,
    "```",
    "",
    "Public examples:",
    JSON.stringify(s.public_examples),
    "",
    "Hidden tests:",
    JSON.stringify(s.hidden_tests),
    "",
    `Produce variant #${opts.variant_index} now. The new slug must be "${s.slug}-variant-${opts.variant_index}". Output JSON only — no markdown fences, no prose.`,
  ];
  return lines.join("\n");
}
