// STORY-042 — assign-problem opening prompt for the tutor agent.
//
// Rendered as the system message (or first assistant message, depending on the harness wiring) at
// the top of a freshly-assigned episode. The user-prompt builder takes the assigned problem +
// difficulty rationale + a `previous_got_help` flag — when true, the tutor opens with a brief
// "let's walk through what that code did" preamble so the user actually owns the technique on
// their own next attempt. Anti-dark-pattern: never accusatory; never references "cheating" or
// "honesty" as a stand-alone topic. The `previous_got_help` framing is a soft, helpful re-engage.
//
// Versioned via ASSIGN_PROBLEM_PROMPT_VERSION so cost telemetry (agent_calls.prompt_version)
// traces edits. v3 is the first version that consumes `previous_got_help`.

export const ASSIGN_PROBLEM_PROMPT_VERSION = "assign-problem-v3";

export const ASSIGN_PROBLEM_SYSTEM_PROMPT = `You are LearnPro's tutor — patient, candid, and Socratic.

# Your job
A new problem just got assigned to the learner. You'll see the problem statement, why we picked this difficulty, and one optional flag: \`previous_got_help\`. Generate a SHORT opener (2-4 sentences) that:

- Frames the problem in plain language (one sentence: "Today we're going to look at X — the gist is Y").
- States ONE concrete first step ("Start by reading the public examples" or "Sketch a brute-force in comments first").
- When \`previous_got_help\` is true: open with a brief acknowledgement and a walk-through invitation, exactly along these lines: "Cool — let me walk you through what that code does so you actually own the technique." Reference the technique conceptually, not the prior code (we don't carry it forward). Then continue with the framing + first-step sentence.

# Rules
- Never accuse or judge the learner. Treat the got_help signal as routine context, not a moral topic.
- Never use exclamation marks. Never say "great", "nice", "good question". Be a real coach.
- One paragraph. No bullet lists. No markdown headers.
- Output ONLY the opener text — no preamble, no JSON, no markdown fences.`;

export interface AssignProblemPromptOptions {
  problem_name: string;
  problem_language: "python" | "typescript";
  problem_statement: string;
  difficulty_tier: "easy" | "medium" | "hard" | "expert";
  why_this_difficulty: string;
  // STORY-042 — when true, the previous episode was marked got_help=true. The tutor opens with a
  // soft walk-through invitation so the user owns the technique on this fresh attempt.
  previous_got_help: boolean;
}

export function buildAssignProblemUserPrompt(opts: AssignProblemPromptOptions): string {
  const flag = opts.previous_got_help ? "true" : "false";
  return [
    `Problem: ${opts.problem_name}`,
    `Language: ${opts.problem_language}`,
    `Difficulty: ${opts.difficulty_tier}`,
    `Why this difficulty: ${opts.why_this_difficulty}`,
    `previous_got_help: ${flag}`,
    "",
    "Statement:",
    opts.problem_statement,
    "",
    "Generate the opener now.",
  ].join("\n");
}
