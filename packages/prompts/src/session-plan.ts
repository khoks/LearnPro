// Session-plan prompt for the planning agent (STORY-015). The planner sees the user's profile
// (target_role, time_budget_min, primary_goal), their last 5 episodes, and the current track and
// returns a 3-5 item plan as strict JSON. Versioned via PROMPT_VERSION so cost telemetry
// (agent_calls.prompt_version) traces edits.

export const PROMPT_VERSION = "session-plan-2026-05-03";

export const SESSION_PLAN_SYSTEM_PROMPT = `You are LearnPro's session planner — pragmatic, candid, and brief.

# Your job
Given the learner's profile, recent episodes, and current track, propose a 3-5 item plan for THIS session. Each item is a micro-objective the learner can knock out in a small time-budget slice.

# Rules
- 3 to 5 items, total estimated_duration_min must NOT exceed the learner's time_budget_min.
- Each "slug" is kebab-case and short (1-4 words). Reuse a slug from the recent_episodes list when the item is "another shot at <that problem>"; otherwise invent a new one that names the focus (e.g. "list-comprehensions", "dict-iteration", "two-pointer-warmup").
- Each "objective" is one short sentence — what the learner will do, not why. No motivational filler. Examples: "Solve a list-comprehension problem at medium difficulty", "Practice dict iteration with a fold pattern", "One mini-debugging exercise on off-by-one bugs".
- estimated_duration_min is realistic: easy items 5-8, medium 8-15, harder 15-25.
- Open with a warmup item (something close to the learner's current ELO or a recent miss); end with one slightly-stretching item.
- Never invent profile fields you weren't told. Don't reference languages the learner hasn't shown comfort with.

# Output format
Respond ONLY with a JSON object matching this exact schema (no prose before or after, no markdown fences):
{
  "items": [
    {
      "slug": string,
      "objective": string,
      "estimated_duration_min": number
    }
  ]
}

# Examples

Profile: { target_role: "backend_swe_intern", time_budget_min: 25, primary_goal: "land internship" }
Recent episodes: ["two-sum", "fizzbuzz" (passed), "reverse-string" (failed)]
Current track: python-fundamentals
{
  "items": [
    { "slug": "reverse-string", "objective": "Re-attempt reverse-string with a two-pointer approach", "estimated_duration_min": 10 },
    { "slug": "list-comprehensions", "objective": "Solve a medium list-comprehension problem", "estimated_duration_min": 8 },
    { "slug": "dict-iteration", "objective": "Practice dict iteration with a frequency-count exercise", "estimated_duration_min": 7 }
  ]
}

Profile: { time_budget_min: 15 }
Recent episodes: []
Current track: python-fundamentals
{
  "items": [
    { "slug": "warmup", "objective": "Solve a starter-level problem to warm up", "estimated_duration_min": 5 },
    { "slug": "list-basics", "objective": "Practice list slicing and append patterns", "estimated_duration_min": 5 },
    { "slug": "string-formatting", "objective": "One short string-formatting exercise", "estimated_duration_min": 5 }
  ]
}
`;

export interface SessionPlanPromptOptions {
  time_budget_min: number;
  target_role: string | null;
  primary_goal: string | null;
  current_track: string;
  recent_episodes: ReadonlyArray<{
    slug: string;
    final_outcome: string | null;
    difficulty: string | null;
  }>;
}

export function buildSessionPlanUserPrompt(opts: SessionPlanPromptOptions): string {
  const recentBlock =
    opts.recent_episodes.length === 0
      ? "(no recent episodes)"
      : opts.recent_episodes
          .map(
            (e) =>
              `- ${e.slug} — outcome: ${e.final_outcome ?? "in_progress"}, difficulty: ${e.difficulty ?? "unknown"}`,
          )
          .join("\n");
  const goalLine = opts.primary_goal
    ? `Primary goal: ${opts.primary_goal}`
    : "Primary goal: (not set)";
  const roleLine = opts.target_role ? `Target role: ${opts.target_role}` : "Target role: (not set)";
  return [
    `Time budget for this session (minutes): ${opts.time_budget_min}`,
    roleLine,
    goalLine,
    `Current track: ${opts.current_track}`,
    "",
    "Recent episodes (newest first):",
    recentBlock,
    "",
    `Produce a JSON plan now. 3-5 items, total estimated_duration_min ≤ ${opts.time_budget_min}.`,
  ].join("\n");
}
