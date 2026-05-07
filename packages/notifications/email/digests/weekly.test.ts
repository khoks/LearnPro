import { describe, expect, it } from "vitest";
import { buildWeeklyDigest, type WeeklyDigestInput } from "./weekly.js";
import { EMPTY_WEEKLY_BODY, WEEKLY_DIGEST_SUBJECT } from "../copy.js";

const BASE_INPUT: WeeklyDigestInput = {
  user_name: "Sam",
  week_start_label: "2026-04-29",
  week_end_label: "2026-05-05",
  week_episodes: [],
  mastery_deltas: [],
  skill_snapshot: [],
  hours_practiced: 0,
  next_step_hint: null,
  unsubscribe_url: "https://learnpro.local/v1/email/unsubscribe?token=t-abc",
};

describe("buildWeeklyDigest", () => {
  it("returns the weekly digest subject verbatim", () => {
    const out = buildWeeklyDigest(BASE_INPUT);
    expect(out.subject).toBe(WEEKLY_DIGEST_SUBJECT);
  });

  it("renders the week-window header", () => {
    const out = buildWeeklyDigest(BASE_INPUT);
    expect(out.text).toContain("Week of 2026-04-29 to 2026-05-05");
    expect(out.html).toContain("Week of 2026-04-29 to 2026-05-05");
  });

  it("renders the empty-week body when there are 0 episodes", () => {
    const out = buildWeeklyDigest(BASE_INPUT);
    expect(out.text).toContain(EMPTY_WEEKLY_BODY);
    // HTML may escape apostrophes — match the prefix.
    expect(out.html).toContain("Quiet week");
  });

  it("summarizes a single-episode week", () => {
    const out = buildWeeklyDigest({
      ...BASE_INPUT,
      week_episodes: [
        {
          problem_slug: "two-sum",
          problem_name: "Two Sum",
          final_outcome: "passed",
          hints_used: 0,
          time_to_solve_ms: 600_000,
        },
      ],
      hours_practiced: 0.2,
    });
    expect(out.text).toContain("Closed 1 problem (1 solved).");
    expect(out.text).toContain("Total practice time: 0.2 hours.");
  });

  it("summarizes a perfect-week (5 of 5)", () => {
    const out = buildWeeklyDigest({
      ...BASE_INPUT,
      week_episodes: Array.from({ length: 5 }, (_, i) => ({
        problem_slug: `p${i}`,
        problem_name: `P${i}`,
        final_outcome: "passed",
        hints_used: 0,
        time_to_solve_ms: 600_000,
      })),
      hours_practiced: 1.5,
    });
    expect(out.text).toContain("Closed 5 problems (5 solved).");
    expect(out.text).toContain("Total practice time: 1.5 hours.");
  });

  it("renders the mastery deltas section when deltas are positive", () => {
    const out = buildWeeklyDigest({
      ...BASE_INPUT,
      mastery_deltas: [
        { concept_name: "list_comprehensions", delta: 12 },
        { concept_name: "dict_basics", delta: 5 },
      ],
    });
    expect(out.text).toContain("Concepts that grew this week:");
    expect(out.text).toContain("list_comprehensions (+12 confidence)");
    expect(out.text).toContain("dict_basics (+5 confidence)");
    expect(out.html).toContain("list_comprehensions");
    expect(out.html).toContain("(+12)");
  });

  it("filters out non-positive mastery deltas (no shame for stagnation)", () => {
    const out = buildWeeklyDigest({
      ...BASE_INPUT,
      mastery_deltas: [
        { concept_name: "growing", delta: 3 },
        { concept_name: "stagnant", delta: 0 },
        { concept_name: "regressed", delta: -4 },
      ],
    });
    expect(out.text).toContain("growing");
    expect(out.text).not.toContain("stagnant");
    expect(out.text).not.toContain("regressed");
  });

  it("renders the skill snapshot section", () => {
    const out = buildWeeklyDigest({
      ...BASE_INPUT,
      skill_snapshot: [
        { concept_name: "loops", confidence: 88 },
        { concept_name: "conditionals", confidence: 72 },
      ],
    });
    expect(out.text).toContain("Top concepts right now:");
    expect(out.text).toContain("loops: 88/100");
    expect(out.text).toContain("conditionals: 72/100");
    expect(out.html).toContain("loops");
    expect(out.html).toContain("88/100");
  });

  it("renders the next-step hint when present", () => {
    const out = buildWeeklyDigest({
      ...BASE_INPUT,
      next_step_hint: "Try the typescript-fundamentals track next.",
    });
    expect(out.text).toContain("What's next: Try the typescript-fundamentals track next.");
    expect(out.html).toContain("What's next");
  });

  it("includes the unsubscribe URL in both renders", () => {
    const out = buildWeeklyDigest(BASE_INPUT);
    expect(out.text).toContain("https://learnpro.local/v1/email/unsubscribe?token=t-abc");
    expect(out.html).toContain("https://learnpro.local/v1/email/unsubscribe?token=t-abc");
  });

  it("escapes HTML in concept names + the next-step hint", () => {
    const out = buildWeeklyDigest({
      ...BASE_INPUT,
      mastery_deltas: [{ concept_name: "<b>bold</b>", delta: 1 }],
      next_step_hint: "<img src=x>",
    });
    expect(out.html).not.toContain("<b>bold</b>");
    expect(out.html).toContain("&lt;b&gt;bold&lt;/b&gt;");
    expect(out.html).not.toContain("<img src=x>");
  });
});
