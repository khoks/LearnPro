// STORY-033 — Async profile-update agent prompt.
//
// Renders the system + user message for the cross-episode synthesis call. The agent runs in a
// BullMQ worker, sees the user's last 30 days of finished episodes, and emits 1-3 short
// observation-style insights in JSON. Examples (from STORY-033 description):
//   - "user reaches for `for` when comprehensions would be cleaner"
//   - "mutability boundaries trip them across multiple problem types"
//
// Anti-dark-pattern stance:
//   - Insights are observations, NEVER accusations or judgements.
//   - Never say "you struggle", "you fail", "you can't" — frame as patterns the tutor can lean
//     into next session.
//   - No emojis, no exclamation marks, no all-caps imperatives.
//
// Versioned via PROFILE_INSIGHTS_PROMPT_VERSION so cost telemetry (agent_calls.prompt_version)
// traces edits.

export const PROFILE_INSIGHTS_PROMPT_VERSION = "profile-insights-v1";

export const PROFILE_INSIGHTS_SYSTEM_PROMPT = `You synthesize learner traits across 30 days of coding episodes.

# Your job
Read the user's recent finished episodes (problem, language, concept tags, outcome, time, hints, attempts) and emit 1-3 SHORT, observation-style insights the tutor can reference next session. Each insight is a cross-episode pattern — never a single-problem note. Examples of the right shape:

- "user reaches for \`for\` when comprehensions would be cleaner"
- "mutability boundaries trip them across multiple problem types"
- "they nail the algorithm but lose attempts on off-by-one indexing"

# Rules
- 1-3 insights total. If the data is too thin to support a real pattern (e.g. fewer than 3 finished episodes, or all episodes hit the same concept), return an empty array.
- Each insight is at most 2 sentences and ≤ 240 characters.
- Frame as observations the tutor can lean into ("...let's keep an eye on that today"), never as accusations or judgements. Never say "you struggle", "you fail", "you can't".
- No motivational filler. No emojis. No exclamation marks.
- Output ONLY a JSON object with the schema below. No prose before or after, no markdown fences.

# Output schema
{
  "insights": [
    {
      "text": string,
      "concept_tags": string[],
      "episodes_referenced": string[]
    }
  ]
}

- "concept_tags" MUST be a subset of the kebab-case slugs that appear in the input episodes (don't invent new ones).
- "episodes_referenced" is the array of episode UUIDs the insight was derived from. Pick the 1-5 most relevant ones (the synthesis must be grounded in actual episodes).

# Examples

Input episodes (truncated): two-sum (passed_with_hints, hints=2, py), valid-parens (failed, attempts=4, py), reverse-string (passed, attempts=1, py)
{
  "insights": [
    { "text": "Across two episodes the learner solves the algorithm cleanly but spends extra attempts on edge cases — empty inputs and single-character strings.", "concept_tags": ["edge-cases"], "episodes_referenced": ["..."] }
  ]
}

Input episodes: only one finished episode in window
{
  "insights": []
}
`;

export interface ProfileInsightsEpisodeShape {
  episode_id: string;
  problem_slug: string;
  problem_name: string;
  problem_language: "python" | "typescript";
  concept_tags: string[];
  final_outcome: string | null;
  hints_used: number;
  attempts: number;
  time_to_solve_ms: number | null;
}

export interface ProfileInsightsPromptOptions {
  recent_episodes: ReadonlyArray<ProfileInsightsEpisodeShape>;
  // Optional: previously-emitted insight texts the synthesis should avoid repeating verbatim.
  // The agent doesn't enforce de-duplication strictly, but the prompt nudges it to vary.
  previous_insight_texts?: ReadonlyArray<string>;
}

export function buildProfileInsightsUserPrompt(opts: ProfileInsightsPromptOptions): string {
  const block =
    opts.recent_episodes.length === 0
      ? "(no recent episodes)"
      : opts.recent_episodes
          .map((e) => {
            const tags = e.concept_tags.length > 0 ? e.concept_tags.join(",") : "-";
            const time =
              e.time_to_solve_ms === null
                ? "in_progress"
                : `${Math.round(e.time_to_solve_ms / 1000)}s`;
            return `- episode_id=${e.episode_id} slug=${e.problem_slug} lang=${e.problem_language} outcome=${e.final_outcome ?? "in_progress"} hints=${e.hints_used} attempts=${e.attempts} time=${time} tags=${tags}`;
          })
          .join("\n");
  const prevBlock =
    opts.previous_insight_texts && opts.previous_insight_texts.length > 0
      ? [
          "",
          "Previous insights for this learner (avoid repeating verbatim):",
          ...opts.previous_insight_texts.map((t) => `- ${t}`),
        ].join("\n")
      : "";
  return [
    "Recent finished episodes (newest first):",
    block,
    prevBlock,
    "",
    "Produce the JSON object now.",
  ].join("\n");
}
