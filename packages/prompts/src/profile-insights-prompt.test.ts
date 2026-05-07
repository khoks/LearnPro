import { describe, expect, it } from "vitest";
import {
  PROFILE_INSIGHTS_PROMPT_VERSION,
  PROFILE_INSIGHTS_SYSTEM_PROMPT,
  buildProfileInsightsUserPrompt,
} from "./profile-insights-prompt.js";

const FORBIDDEN_PHRASES = [
  // EPIC-011 anti-dark-pattern phrases — the synthesis must never accuse or moralize.
  "DON'T LOSE",
  "lose your streak",
  "fall behind",
  "DAY ",
  "🔥",
  "⚠️",
  "you struggle",
  "you fail",
  "you can't",
  "cheating",
  "cheat",
];

describe("PROFILE_INSIGHTS_SYSTEM_PROMPT — STORY-033", () => {
  it("is versioned with the v1 tag", () => {
    expect(PROFILE_INSIGHTS_PROMPT_VERSION).toBe("profile-insights-v1");
  });

  it("instructs the agent to emit 1-3 short insights with the right shape", () => {
    expect(PROFILE_INSIGHTS_SYSTEM_PROMPT).toContain("1-3 insights");
    expect(PROFILE_INSIGHTS_SYSTEM_PROMPT).toContain("observation");
    expect(PROFILE_INSIGHTS_SYSTEM_PROMPT).toContain("episodes_referenced");
    expect(PROFILE_INSIGHTS_SYSTEM_PROMPT).toContain("concept_tags");
  });

  it("instructs the agent to return an empty array when data is too thin", () => {
    expect(PROFILE_INSIGHTS_SYSTEM_PROMPT).toContain("empty array");
  });

  it("specifies the JSON output schema", () => {
    expect(PROFILE_INSIGHTS_SYSTEM_PROMPT).toContain('"insights"');
    expect(PROFILE_INSIGHTS_SYSTEM_PROMPT).toContain('"text"');
  });

  it("does not contain dark-pattern / accusatory phrases", () => {
    const lowercased = PROFILE_INSIGHTS_SYSTEM_PROMPT.toLowerCase();
    for (const phrase of FORBIDDEN_PHRASES) {
      // The prompt itself instructs the agent NEVER to use these phrases — but it's allowed to
      // mention them as forbidden examples. This guard catches accidental tone drift in the
      // surrounding rule text.
      const occurrences = lowercased.split(phrase.toLowerCase()).length - 1;
      // Each forbidden phrase may appear once in the "Never say ... " rule. Assert at most once.
      expect(
        occurrences,
        `forbidden phrase "${phrase}" should appear at most once (only in the "never say" rule), saw ${occurrences}`,
      ).toBeLessThanOrEqual(1);
    }
  });

  it("instructs the agent to frame insights as observations, never accusations", () => {
    expect(PROFILE_INSIGHTS_SYSTEM_PROMPT.toLowerCase()).toContain("observation");
    expect(PROFILE_INSIGHTS_SYSTEM_PROMPT.toLowerCase()).toContain("never");
  });

  it("forbids emojis and exclamation marks in the insight output", () => {
    expect(PROFILE_INSIGHTS_SYSTEM_PROMPT.toLowerCase()).toContain("no emoji");
    expect(PROFILE_INSIGHTS_SYSTEM_PROMPT.toLowerCase()).toContain("no exclamation");
  });
});

describe("buildProfileInsightsUserPrompt — STORY-033", () => {
  it("renders an empty-window message when there are no episodes", () => {
    const out = buildProfileInsightsUserPrompt({ recent_episodes: [] });
    expect(out).toContain("(no recent episodes)");
    expect(out).toContain("JSON");
  });

  it("renders one row per episode with all the synthesis-relevant fields", () => {
    const out = buildProfileInsightsUserPrompt({
      recent_episodes: [
        {
          episode_id: "11111111-1111-4111-8111-111111111111",
          problem_slug: "two-sum",
          problem_name: "Two Sum",
          problem_language: "python",
          concept_tags: ["arrays", "hash-tables"],
          final_outcome: "passed_with_hints",
          hints_used: 2,
          attempts: 3,
          time_to_solve_ms: 180_000,
        },
      ],
    });
    expect(out).toContain("episode_id=11111111-1111-4111-8111-111111111111");
    expect(out).toContain("slug=two-sum");
    expect(out).toContain("lang=python");
    expect(out).toContain("outcome=passed_with_hints");
    expect(out).toContain("hints=2");
    expect(out).toContain("attempts=3");
    expect(out).toContain("time=180s");
    expect(out).toContain("tags=arrays,hash-tables");
  });

  it("falls back to '-' when an episode has no concept tags", () => {
    const out = buildProfileInsightsUserPrompt({
      recent_episodes: [
        {
          episode_id: "11111111-1111-4111-8111-111111111111",
          problem_slug: "x",
          problem_name: "x",
          problem_language: "typescript",
          concept_tags: [],
          final_outcome: "passed",
          hints_used: 0,
          attempts: 1,
          time_to_solve_ms: null,
        },
      ],
    });
    expect(out).toContain("tags=-");
    expect(out).toContain("time=in_progress");
  });

  it("includes a previous-insights block when supplied", () => {
    const out = buildProfileInsightsUserPrompt({
      recent_episodes: [],
      previous_insight_texts: [
        "user reaches for `for` when comprehensions would be cleaner",
        "mutability boundaries trip them across multiple problem types",
      ],
    });
    expect(out).toContain("Previous insights");
    expect(out).toContain("for` when comprehensions");
    expect(out).toContain("mutability boundaries");
  });
});
