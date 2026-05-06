import { describe, expect, it } from "vitest";
import { buildDailyDigest, type DailyDigestInput } from "./daily.js";
import { buildWeeklyDigest, type WeeklyDigestInput } from "./weekly.js";
import {
  containsForbiddenPhrase,
  DAILY_DIGEST_SUBJECT,
  EMPTY_DAILY_BODY,
  EMPTY_WEEKLY_BODY,
  UNSUBSCRIBE_FOOTER,
  WEEKLY_DIGEST_SUBJECT,
} from "../copy.js";

// STORY-045 — coach-voice / anti-dark-pattern guard. Mirrors STORY-023's daily-reminder copy
// test. The set of forbidden phrases is shared with `@learnpro/notifications/copy.ts`. Every
// digest variant (empty, single-episode, perfect-week) must scan clean.

const PERFECT_WEEK_INPUT: WeeklyDigestInput = {
  user_name: "Sam",
  week_start_label: "2026-04-29",
  week_end_label: "2026-05-05",
  week_episodes: Array.from({ length: 7 }, (_, i) => ({
    problem_slug: `p${i}`,
    problem_name: `Problem ${i}`,
    final_outcome: "passed",
    hints_used: 0,
    time_to_solve_ms: 600_000,
  })),
  mastery_deltas: [
    { concept_name: "list_comprehensions", delta: 14 },
    { concept_name: "loops", delta: 7 },
  ],
  skill_snapshot: [
    { concept_name: "loops", confidence: 92 },
    { concept_name: "conditionals", confidence: 81 },
  ],
  hours_practiced: 4.7,
  next_step_hint: "Step into the typescript-fundamentals track when you're ready.",
  unsubscribe_url: "https://learnpro.local/v1/email/unsubscribe?token=t-perfect",
};

const SINGLE_EP_INPUT: DailyDigestInput = {
  user_name: "Sam",
  yesterday_label: "2026-05-04",
  today_label: "2026-05-05",
  yesterday_episodes: [
    {
      problem_slug: "two-sum",
      problem_name: "Two Sum",
      final_outcome: "passed",
      hints_used: 1,
      time_to_solve_ms: 600_000,
    },
  ],
  today_plan_items: [
    { slug: "p1", objective: "Practice list comprehensions", estimated_duration_min: 15 },
  ],
  difficulty_hint: "Stepping up to medium-difficulty problems.",
  unsubscribe_url: "https://learnpro.local/v1/email/unsubscribe?token=t-single",
};

const EMPTY_DAY_INPUT: DailyDigestInput = {
  ...SINGLE_EP_INPUT,
  yesterday_episodes: [],
  today_plan_items: [],
  difficulty_hint: null,
};

const EMPTY_WEEK_INPUT: WeeklyDigestInput = {
  ...PERFECT_WEEK_INPUT,
  week_episodes: [],
  mastery_deltas: [],
  skill_snapshot: [],
  hours_practiced: 0,
  next_step_hint: null,
};

function scan(...parts: string[]): string | null {
  for (const p of parts) {
    const hit = containsForbiddenPhrase(p);
    if (hit !== null) return hit;
  }
  return null;
}

describe("digest copy: forbidden-phrase scan (EPIC-011 anti-dark-pattern)", () => {
  it("DAILY_DIGEST_SUBJECT is clean", () => {
    expect(containsForbiddenPhrase(DAILY_DIGEST_SUBJECT)).toBeNull();
  });

  it("WEEKLY_DIGEST_SUBJECT is clean", () => {
    expect(containsForbiddenPhrase(WEEKLY_DIGEST_SUBJECT)).toBeNull();
  });

  it("EMPTY_DAILY_BODY is clean", () => {
    expect(containsForbiddenPhrase(EMPTY_DAILY_BODY)).toBeNull();
  });

  it("EMPTY_WEEKLY_BODY is clean", () => {
    expect(containsForbiddenPhrase(EMPTY_WEEKLY_BODY)).toBeNull();
  });

  it("UNSUBSCRIBE_FOOTER is clean", () => {
    expect(containsForbiddenPhrase(UNSUBSCRIBE_FOOTER)).toBeNull();
  });

  it("daily digest empty-day variant: subject + html + text are clean", () => {
    const out = buildDailyDigest(EMPTY_DAY_INPUT);
    expect(scan(out.subject, out.html, out.text)).toBeNull();
  });

  it("daily digest single-episode variant: subject + html + text are clean", () => {
    const out = buildDailyDigest(SINGLE_EP_INPUT);
    expect(scan(out.subject, out.html, out.text)).toBeNull();
  });

  it("weekly digest empty-week variant: subject + html + text are clean", () => {
    const out = buildWeeklyDigest(EMPTY_WEEK_INPUT);
    expect(scan(out.subject, out.html, out.text)).toBeNull();
  });

  it("weekly digest perfect-week variant: subject + html + text are clean", () => {
    const out = buildWeeklyDigest(PERFECT_WEEK_INPUT);
    expect(scan(out.subject, out.html, out.text)).toBeNull();
  });
});
