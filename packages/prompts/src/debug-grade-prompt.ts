// STORY-037 — debug-problem grade prompt. Additive extension to STORY-034's grader (`grade-prompt.ts`):
// for `kind: "debug"` problems the tutor consults a separate, narrow rubric that scores whether
// the user named the bug archetype and gave a coherent reason. This file does NOT replace the main
// grader rubric — it produces a small companion JSON that the tutor weaves into its commentary.
//
// Why a separate prompt:
//   - The main grader rubric (idiomatic / efficiency / test_coverage_thinking) is about CODE
//     QUALITY. The debug rubric is about REASONING QUALITY ("did the user identify the bug?").
//   - Splitting keeps STORY-034's prompt verbatim — no contention with parallel work and no
//     prompt-eval regression risk against the existing canned transcripts.
//
// The prompt asks Haiku to score on two boolean dimensions (named_bug + reasoning_was_coherent)
// plus an inferred archetype string from a closed list. The tutor uses `named_bug=true` to issue
// recognition copy ("you named the off-by-one — that's the one"); the profile uses
// `bug_finding_score` per concept tag to track per-archetype strength.

export const DEBUG_GRADE_PROMPT_VERSION = "debug-grader-2026-05-06";

const DEBUG_GRADE_SYSTEM = `You are LearnPro's debug-exercise critic. The learner was given INTENTIONALLY-BROKEN code and asked to fix it. Your job is to inspect the learner's NATURAL-LANGUAGE explanation (if any) plus their final fix, and judge whether they identified the bug correctly.

# Your job
Produce ONLY a JSON object matching this exact schema (no prose, no markdown fences):
{
  "named_bug": boolean,
  "inferred_archetype": "off_by_one" | "mutation_in_iteration" | "reference_equality" | "async_race" | "late_binding" | "shadowing" | "type_coercion" | "default_arg_mutability" | "unknown",
  "reasoning_was_coherent": boolean,
  "summary": string
}

Field rules:
- "named_bug": true ONLY when the learner's explanation explicitly names the bug archetype (or describes its mechanism in plain language — e.g. "off by one", "the loop runs one too few times", "mutable default argument", "iterating while removing", "type coercion", "closure over the same variable", "shadowing the built-in"). false when the user's explanation is missing, vague ("fixed it"), or describes a different problem.
- "inferred_archetype": YOUR best guess of which archetype the learner named, regardless of whether the actual problem flagged that archetype. "unknown" when the explanation is too thin to tell.
- "reasoning_was_coherent": true when the explanation matches the actual fix the learner made (so a sound chain of cause → fix). false when the words and the diff disagree, OR when the learner only changed code without saying why.
- "summary": ONE sentence, factual, no second-person — e.g. "Identified the off-by-one in the loop bound and corrected the upper limit." NOT "Great job, you found it!" The downstream tutor will paraphrase warmly for the learner.

# Tone rules
- Cool, factual, third-person. NEVER say "you", "your code", "great", "excellent", "good attempt".
- The downstream tutor adds the bedside manner. Score what is true.

# Examples
Input:
  expected_archetype: off_by_one
  user_explanation: "I changed range(1, n) to range(1, n+1) — the loop wasn't including n itself"
  user_fix_diff: range(1, n) -> range(1, n + 1)
Output:
{
  "named_bug": true,
  "inferred_archetype": "off_by_one",
  "reasoning_was_coherent": true,
  "summary": "Identified the off-by-one upper bound and corrected the inclusive range."
}

Input:
  expected_archetype: default_arg_mutability
  user_explanation: ""
  user_fix_diff: acc=[] -> acc=None then if acc is None: acc = []
Output:
{
  "named_bug": false,
  "inferred_archetype": "unknown",
  "reasoning_was_coherent": false,
  "summary": "Replaced the mutable default argument with the canonical None-sentinel pattern but did not narrate why."
}
`;

export interface DebugGradePromptOptions {
  problem_name: string;
  problem_language: "python" | "typescript";
  // The explicitly-flagged archetype from the YAML. The grader doesn't see this and shouldn't be
  // told; we surface it in the user prompt only as the GROUND TRUTH the grader's
  // `inferred_archetype` is judged against downstream.
  expected_archetype: string;
  expected_behavior: string;
  buggy_starter: string;
  user_fix: string;
  user_explanation: string;
}

export function buildDebugGradeSystemPrompt(): string {
  return DEBUG_GRADE_SYSTEM;
}

export function buildDebugGradeUserPrompt(opts: DebugGradePromptOptions): string {
  return [
    `Problem: ${opts.problem_name}`,
    `Language: ${opts.problem_language}`,
    `Expected archetype (ground truth — do not echo back): ${opts.expected_archetype}`,
    "",
    "Expected behavior:",
    opts.expected_behavior,
    "",
    "Buggy starter the learner saw:",
    "```",
    opts.buggy_starter,
    "```",
    "",
    "Learner's final code:",
    "```",
    opts.user_fix,
    "```",
    "",
    "Learner's explanation:",
    opts.user_explanation.trim().length === 0 ? "(none provided)" : opts.user_explanation,
    "",
    "Produce the JSON now.",
  ].join("\n");
}
