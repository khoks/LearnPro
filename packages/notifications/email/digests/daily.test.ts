import { describe, expect, it } from "vitest";
import { buildDailyDigest, type DailyDigestInput } from "./daily.js";
import { DAILY_DIGEST_SUBJECT, EMPTY_DAILY_BODY } from "../copy.js";

const BASE_INPUT: DailyDigestInput = {
  user_name: "Sam",
  yesterday_label: "2026-05-04",
  today_label: "2026-05-05",
  yesterday_episodes: [],
  today_plan_items: [],
  difficulty_hint: null,
  unsubscribe_url: "https://learnpro.local/v1/email/unsubscribe?token=t-abc",
};

describe("buildDailyDigest", () => {
  it("returns the daily digest subject verbatim", () => {
    const out = buildDailyDigest(BASE_INPUT);
    expect(out.subject).toBe(DAILY_DIGEST_SUBJECT);
  });

  it("greets by name when present", () => {
    const out = buildDailyDigest(BASE_INPUT);
    expect(out.text).toContain("Hi Sam,");
    expect(out.html).toContain("Hi Sam,");
  });

  it("falls back to a generic greeting when user_name is null", () => {
    const out = buildDailyDigest({ ...BASE_INPUT, user_name: null });
    expect(out.text).toContain("Hi there,");
    expect(out.html).toContain("Hi there,");
  });

  it("renders the empty-state body when no episodes closed yesterday", () => {
    const out = buildDailyDigest(BASE_INPUT);
    expect(out.text).toContain(EMPTY_DAILY_BODY);
    // HTML escapes apostrophes — match the prefix instead.
    expect(out.html).toContain("No problems closed yesterday");
  });

  it("summarizes a single passed episode", () => {
    const out = buildDailyDigest({
      ...BASE_INPUT,
      yesterday_episodes: [
        {
          problem_slug: "two-sum",
          problem_name: "Two Sum",
          final_outcome: "passed",
          hints_used: 0,
          time_to_solve_ms: 600_000,
        },
      ],
    });
    expect(out.text).toContain("1 problem solved.");
    expect(out.text).toContain("Two Sum");
    expect(out.text).toContain("passed");
    expect(out.html).toContain("1 problem solved.");
    expect(out.html).toContain("Two Sum");
  });

  it("renders 'X of Y solved' when at least one episode failed", () => {
    const out = buildDailyDigest({
      ...BASE_INPUT,
      yesterday_episodes: [
        {
          problem_slug: "two-sum",
          problem_name: "Two Sum",
          final_outcome: "passed",
          hints_used: 0,
          time_to_solve_ms: null,
        },
        {
          problem_slug: "list-comprehensions",
          problem_name: "List Comprehensions",
          final_outcome: "failed",
          hints_used: 1,
          time_to_solve_ms: null,
        },
      ],
    });
    expect(out.text).toContain("1 of 2 solved.");
    expect(out.text).toContain("didn't pass yet");
    expect(out.html).toContain("1 of 2 solved.");
  });

  it("calls out hints used for passed_with_hints outcomes", () => {
    const out = buildDailyDigest({
      ...BASE_INPUT,
      yesterday_episodes: [
        {
          problem_slug: "fizzbuzz",
          problem_name: "FizzBuzz",
          final_outcome: "passed_with_hints",
          hints_used: 2,
          time_to_solve_ms: null,
        },
      ],
    });
    expect(out.text).toContain("passed with 2 hint(s)");
  });

  it("renders Today's plan when there are pending items", () => {
    const out = buildDailyDigest({
      ...BASE_INPUT,
      today_plan_items: [
        {
          slug: "p1",
          objective: "Practice list comprehensions",
          estimated_duration_min: 15,
        },
        {
          slug: "p2",
          objective: "Review dict basics",
          estimated_duration_min: 10,
        },
      ],
    });
    expect(out.text).toContain("Today (2026-05-05)");
    expect(out.text).toContain("Practice list comprehensions");
    expect(out.text).toContain("(~15 min)");
    expect(out.text).toContain("Review dict basics");
    expect(out.html).toContain("Practice list comprehensions");
  });

  it("filters out completed plan items", () => {
    const out = buildDailyDigest({
      ...BASE_INPUT,
      today_plan_items: [
        { slug: "p1", objective: "Done", estimated_duration_min: 10, status: "completed" },
        { slug: "p2", objective: "Pending", estimated_duration_min: 10, status: "pending" },
      ],
    });
    expect(out.text).not.toContain("Done");
    expect(out.text).toContain("Pending");
  });

  it("includes the difficulty hint when present", () => {
    const out = buildDailyDigest({
      ...BASE_INPUT,
      difficulty_hint: "Stepping up to medium-difficulty problems.",
    });
    expect(out.text).toContain("Suggested difficulty: Stepping up to medium-difficulty problems.");
    expect(out.html).toContain("Stepping up to medium-difficulty problems.");
  });

  it("omits the difficulty hint section when null", () => {
    const out = buildDailyDigest(BASE_INPUT);
    expect(out.text).not.toContain("Suggested difficulty");
    expect(out.html).not.toContain("Suggested difficulty");
  });

  it("includes the unsubscribe URL in both html and text", () => {
    const out = buildDailyDigest(BASE_INPUT);
    expect(out.text).toContain("https://learnpro.local/v1/email/unsubscribe?token=t-abc");
    expect(out.html).toContain("https://learnpro.local/v1/email/unsubscribe?token=t-abc");
  });

  it("escapes HTML special chars in problem names", () => {
    const out = buildDailyDigest({
      ...BASE_INPUT,
      yesterday_episodes: [
        {
          problem_slug: "evil",
          problem_name: "<script>alert(1)</script>",
          final_outcome: "passed",
          hints_used: 0,
          time_to_solve_ms: null,
        },
      ],
    });
    expect(out.html).not.toContain("<script>alert(1)</script>");
    expect(out.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });
});
