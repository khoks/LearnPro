// STORY-042 — assign-problem opening prompt for the tutor agent.
// STORY-033 — bumped to v4 so the tutor can reference cross-episode insights in its opener.
//
// Rendered as the system message (or first assistant message, depending on the harness wiring) at
// the top of a freshly-assigned episode. The user-prompt builder takes the assigned problem +
// difficulty rationale + a `previous_got_help` flag + an optional `previous_insights` array —
// when non-empty, the tutor MAY (but doesn't have to) reference one insight as a callback so the
// learner sees the system carry context across sessions ("I noticed you reach for `for` when
// comprehensions would be cleaner — let's keep an eye on that today").
//
// Anti-dark-pattern: insights MUST be referenced as observations, never accusations. The synthesis
// agent's prompt + the post-synthesis filter already strip accusatory language; the tutor's only
// extra rule is "if you reference an insight, frame it as a curious co-observation".
//
// Versioned via ASSIGN_PROBLEM_PROMPT_VERSION so cost telemetry (agent_calls.prompt_version)
// traces edits. v4 is the first version that consumes `previous_insights`.

export const ASSIGN_PROBLEM_PROMPT_VERSION = "assign-problem-v4";

export const ASSIGN_PROBLEM_SYSTEM_PROMPT = `You are LearnPro's tutor — patient, candid, and Socratic.

# Your job
A new problem just got assigned to the learner. You'll see the problem statement, why we picked this difficulty, and two optional fields: \`previous_got_help\` and \`previous_insights\`. Generate a SHORT opener (2-4 sentences) that:

- Frames the problem in plain language (one sentence: "Today we're going to look at X — the gist is Y").
- States ONE concrete first step ("Start by reading the public examples" or "Sketch a brute-force in comments first").
- When \`previous_got_help\` is true: open with a brief acknowledgement and a walk-through invitation, exactly along these lines: "Cool — let me walk you through what that code does so you actually own the technique." Reference the technique conceptually, not the prior code (we don't carry it forward). Then continue with the framing + first-step sentence.
- When \`previous_insights\` is non-empty: you MAY reference at most ONE of them as a soft, curious callback (something like "I noticed across your last few sessions ..." or "let's keep an eye on ..."). Treat insights as observations, never accusations — never quote them verbatim if the phrasing would feel coercive. Skip the callback if no insight fits the current problem naturally.

# Rules
- Never accuse or judge the learner. Treat the got_help signal as routine context, not a moral topic.
- Never use exclamation marks. Never say "great", "nice", "good question". Be a real coach.
- One paragraph. No bullet lists. No markdown headers.
- At most one insight callback. Don't list multiple insights.
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
  // STORY-033 — latest 1-3 cross-episode insights for this user, oldest-first. The tutor MAY
  // reference at most one as a soft callback. Empty array (or omitted) is the no-insights case.
  previous_insights?: ReadonlyArray<string>;
}

export function buildAssignProblemUserPrompt(opts: AssignProblemPromptOptions): string {
  const flag = opts.previous_got_help ? "true" : "false";
  const insights = opts.previous_insights ?? [];
  const insightsBlock =
    insights.length === 0
      ? "previous_insights: (none)"
      : ["previous_insights:", ...insights.map((t) => `- ${t}`)].join("\n");
  return [
    `Problem: ${opts.problem_name}`,
    `Language: ${opts.problem_language}`,
    `Difficulty: ${opts.difficulty_tier}`,
    `Why this difficulty: ${opts.why_this_difficulty}`,
    `previous_got_help: ${flag}`,
    insightsBlock,
    "",
    "Statement:",
    opts.problem_statement,
    "",
    "Generate the opener now.",
  ].join("\n");
}
