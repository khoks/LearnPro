// STORY-038 — comprehension free-text grade prompt. Companion to STORY-034's grader and STORY-037's
// debug grader: for `kind: "comprehension"` with `answer_format: "free_text"`, the tutor consults
// a narrow rubric that asks Haiku "is the learner's natural-language answer factually correct
// (compared to the expected answer)?" Yes/no plus a one-sentence factual reason.
//
// Multiple-choice comprehension uses a deterministic index match — there is nothing to LLM-grade.
// Only the free-text branch reaches this prompt.
//
// Why a separate prompt:
//   - Code-quality rubrics (idiomatic / efficiency / coverage) are meaningless here — there is
//     no code being written. The user answered prose, and prose-vs-prose is the rubric.
//   - The expected answer is a compact "what good looks like"; the grader's job is judging
//     CONTENT EQUIVALENCE (does the user's answer convey the same facts?), not surface-level
//     wording match.

export const COMPREHENSION_GRADE_PROMPT_VERSION = "comprehension-grader-2026-05-06";

const COMPREHENSION_GRADE_SYSTEM = `You are LearnPro's comprehension-exercise grader. The learner read code (the "starter_code") and answered a free-text question about it. Your job is to judge whether their answer conveys the same FACTS as the reference answer — independently of phrasing, length, or style.

# Your job
Produce ONLY a JSON object matching this exact schema (no prose, no markdown fences):
{
  "correct": boolean,
  "reasoning": string
}

Field rules:
- "correct": true when the learner's answer captures the SAME factual content as the expected answer — even if their phrasing, ordering, or examples differ. false when the learner is missing a critical fact, contradicts the expected answer, OR provides an answer that is too vague / off-topic to be evaluated. Be charitable on phrasing; strict on factual accuracy.
- "reasoning": ONE sentence, factual, no second-person, no praise. Examples:
    "Identifies the off-by-one upper bound and explains why range stops one early."
    "Misses the central point — the bug is mutable defaults, not the conditional."
  NOT: "Great job! You got it!" or "Almost there..."

# Tone rules
- Cool, factual, third-person. NEVER say "you", "your code", "great", "excellent", "good attempt", "try again".
- The downstream tutor adds the bedside manner. Score what is true.

# Examples
Question: What is the worst-case time complexity?
Expected answer: O(n) — a linear scan over items.
User answer: "Linear time, since we go through the array once."
Output:
{ "correct": true, "reasoning": "Identifies linear scan and the corresponding O(n) classification." }

Question: Why is fib slow without memoization?
Expected answer: Without memoization, fib re-computes overlapping subproblems exponentially many times. Memoizing fib reduces each fib(k) to a single computation, dropping the runtime from O(2^n) to O(n).
User answer: "Because it's recursive."
Output:
{ "correct": false, "reasoning": "Names recursion but misses the central reason — overlapping subproblems being recomputed, which is what memoization fixes." }
`;

export interface ComprehensionGradePromptOptions {
  problem_name: string;
  problem_language: "python" | "typescript";
  // The code the learner read. Provided for the grader's context — it is NOT the answer.
  starter_code: string;
  // The question the learner answered.
  question: string;
  // The reference answer the grader compares against. Surfaced as GROUND TRUTH; the grader is
  // told NOT to echo it back, just to judge equivalence.
  expected_answer: string;
  // The learner's free-text answer.
  user_answer: string;
}

export function buildComprehensionGradeSystemPrompt(): string {
  return COMPREHENSION_GRADE_SYSTEM;
}

export function buildComprehensionGradeUserPrompt(opts: ComprehensionGradePromptOptions): string {
  return [
    `Problem: ${opts.problem_name}`,
    `Language: ${opts.problem_language}`,
    "",
    "Code the learner read:",
    "```",
    opts.starter_code,
    "```",
    "",
    "Question:",
    opts.question,
    "",
    "Expected answer (ground truth — do not echo back):",
    opts.expected_answer,
    "",
    "Learner's answer:",
    opts.user_answer.trim().length === 0 ? "(none provided)" : opts.user_answer,
    "",
    "Produce the JSON now.",
  ].join("\n");
}
