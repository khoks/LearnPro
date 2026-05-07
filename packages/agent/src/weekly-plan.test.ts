import { describe, expect, it } from "vitest";
import {
  buildWeeklyPlan,
  computeWeeklyDampeningReason,
  reasoningForDailyConcept,
  SUPPRESSED_REPLAN_ONE_DAY_WEEKLY,
  SUPPRESSED_REPLAN_WEEKEND_WEEKLY,
  WeeklyPlanSchema,
  type WeeklyPlanConceptGraph,
  type WeeklyPlanRecentEpisode,
} from "./weekly-plan.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const TRACK_SLUG = "python-fundamentals";

// Wednesday at noon UTC — a normal weekday, not in the weekend dampening branch.
const WEDNESDAY_NOON = new Date("2026-04-29T12:00:00Z");
// Saturday at noon UTC — exercises the weekend dampening branch.
const SATURDAY_NOON = new Date("2026-05-02T12:00:00Z");
// Sunday at noon UTC.
const SUNDAY_NOON = new Date("2026-05-03T12:00:00Z");

// Deterministic fake graph — 6 concepts on python-fundamentals, linear chain so the topo order
// matches declaration order. Tests can subset / re-order edges to exercise specific branches.
function makeFakeGraph(): WeeklyPlanConceptGraph {
  return {
    concepts: [
      {
        slug: "python.basics.variables",
        name: "Variables",
        track_slugs: ["python-fundamentals"],
        tags: ["fundamentals"],
      },
      {
        slug: "python.basics.lists",
        name: "Lists",
        track_slugs: ["python-fundamentals"],
        tags: ["fundamentals"],
      },
      {
        slug: "python.basics.for-loops",
        name: "For loops",
        track_slugs: ["python-fundamentals"],
        tags: ["fundamentals"],
      },
      {
        slug: "python.basics.list-comprehensions",
        name: "List comprehensions",
        track_slugs: ["python-fundamentals"],
        tags: ["fundamentals", "data-modeling"],
      },
      {
        slug: "python.basics.generators",
        name: "Generators",
        track_slugs: ["python-fundamentals"],
        tags: ["fundamentals", "advanced"],
      },
      {
        slug: "python.basics.dicts",
        name: "Dicts",
        track_slugs: ["python-fundamentals"],
        tags: ["fundamentals", "data-modeling"],
      },
      // A concept on a *different* track — should be filtered out of the picker.
      {
        slug: "ts.basics.types",
        name: "TS types",
        track_slugs: ["typescript-fundamentals"],
        tags: ["typing"],
      },
    ],
    edges: [
      { from: "python.basics.lists", to: "python.basics.variables" },
      { from: "python.basics.for-loops", to: "python.basics.lists" },
      { from: "python.basics.list-comprehensions", to: "python.basics.for-loops" },
      { from: "python.basics.generators", to: "python.basics.list-comprehensions" },
      { from: "python.basics.dicts", to: "python.basics.lists" },
    ],
  };
}

function passEp(slug: string, when: Date): WeeklyPlanRecentEpisode {
  return { concept_slugs: [slug], final_outcome: "pass", started_at: when };
}

describe("buildWeeklyPlan — empty / no-graph state", () => {
  it("returns an empty theme when the graph has no concepts on the requested track", () => {
    const plan = buildWeeklyPlan({
      user_id: USER_ID,
      track_slug: "nonexistent-track",
      today: WEDNESDAY_NOON,
      conceptGraph: makeFakeGraph(),
      recentEpisodes: [],
      dueReviews: [],
    });
    expect(plan.theme).toBe("");
    expect(plan.theme_concept_slug).toBe("");
    expect(plan.daily_concepts).toEqual([]);
    expect(plan.theme_concepts).toEqual([]);
    expect(plan.due_reviews_count).toBe(0);
  });

  it("validates against WeeklyPlanSchema (Zod boundary) for an empty graph", () => {
    const plan = buildWeeklyPlan({
      user_id: USER_ID,
      track_slug: "nonexistent-track",
      today: WEDNESDAY_NOON,
      conceptGraph: { concepts: [], edges: [] },
      recentEpisodes: [],
      dueReviews: [],
    });
    const parsed = WeeklyPlanSchema.safeParse(plan);
    expect(parsed.success).toBe(true);
  });

  it("emits an ISO yyyy-mm-dd week_start_date in UTC", () => {
    const plan = buildWeeklyPlan({
      user_id: USER_ID,
      track_slug: TRACK_SLUG,
      today: WEDNESDAY_NOON,
      conceptGraph: makeFakeGraph(),
      recentEpisodes: [],
      dueReviews: [],
    });
    // Wednesday 2026-04-29 → Monday-week-start 2026-04-27.
    expect(plan.week_start_date).toBe("2026-04-27");
  });

  it("respects weekStartsOn=7 (Sunday) for the week_start_date", () => {
    const plan = buildWeeklyPlan({
      user_id: USER_ID,
      track_slug: TRACK_SLUG,
      today: WEDNESDAY_NOON,
      weekStartsOn: 7,
      conceptGraph: makeFakeGraph(),
      recentEpisodes: [],
      dueReviews: [],
    });
    // Wednesday 2026-04-29 → Sunday-week-start 2026-04-26.
    expect(plan.week_start_date).toBe("2026-04-26");
  });
});

describe("buildWeeklyPlan — theme picker over knowledge graph", () => {
  it("picks the topologically-first unpassed concept as the theme on cold start", () => {
    const plan = buildWeeklyPlan({
      user_id: USER_ID,
      track_slug: TRACK_SLUG,
      today: WEDNESDAY_NOON,
      conceptGraph: makeFakeGraph(),
      recentEpisodes: [],
      dueReviews: [],
    });
    // Cold start → frontier is at index 0 (variables). Picker returns 4 concepts (on-pace
    // default).
    expect(plan.theme_concept_slug).toBe("python.basics.variables");
    expect(plan.theme).toBe("Variables week");
    expect(plan.theme_concepts.length).toBeGreaterThanOrEqual(3);
    expect(plan.theme_concepts.length).toBeLessThanOrEqual(5);
  });

  it("walks past concepts the user has already passed", () => {
    const plan = buildWeeklyPlan({
      user_id: USER_ID,
      track_slug: TRACK_SLUG,
      today: WEDNESDAY_NOON,
      conceptGraph: makeFakeGraph(),
      recentEpisodes: [
        passEp("python.basics.variables", new Date("2026-04-28T10:00:00Z")),
        passEp("python.basics.lists", new Date("2026-04-28T11:00:00Z")),
      ],
      dueReviews: [],
    });
    expect(plan.theme_concepts).not.toContain("python.basics.variables");
    expect(plan.theme_concepts).not.toContain("python.basics.lists");
    // Topo order with Kahn's lexicographic queue puts `dicts` (depends only on `lists`) ahead of
    // `for-loops` after lists is removed. Both are valid next-frontier picks; the picker walks in
    // topo-order.
    expect(plan.theme_concept_slug).toBe("python.basics.dicts");
  });

  it("filters concepts not on the requested track", () => {
    const plan = buildWeeklyPlan({
      user_id: USER_ID,
      track_slug: TRACK_SLUG,
      today: WEDNESDAY_NOON,
      conceptGraph: makeFakeGraph(),
      recentEpisodes: [],
      dueReviews: [],
    });
    expect(plan.theme_concepts).not.toContain("ts.basics.types");
  });

  it("emits 7 day rows with day_index 0..6 in order", () => {
    const plan = buildWeeklyPlan({
      user_id: USER_ID,
      track_slug: TRACK_SLUG,
      today: WEDNESDAY_NOON,
      conceptGraph: makeFakeGraph(),
      recentEpisodes: [],
      dueReviews: [],
    });
    expect(plan.daily_concepts).toHaveLength(7);
    expect(plan.daily_concepts.map((d) => d.day_index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("each daily concept has a reasoning string", () => {
    const plan = buildWeeklyPlan({
      user_id: USER_ID,
      track_slug: TRACK_SLUG,
      today: WEDNESDAY_NOON,
      conceptGraph: makeFakeGraph(),
      recentEpisodes: [],
      dueReviews: [],
    });
    for (const d of plan.daily_concepts) {
      expect(d.reasoning.length).toBeGreaterThan(0);
    }
  });

  it("each daily concept references one of the theme_concepts", () => {
    const plan = buildWeeklyPlan({
      user_id: USER_ID,
      track_slug: TRACK_SLUG,
      today: WEDNESDAY_NOON,
      conceptGraph: makeFakeGraph(),
      recentEpisodes: [],
      dueReviews: [],
    });
    for (const d of plan.daily_concepts) {
      expect(plan.theme_concepts).toContain(d.concept_slug);
    }
  });

  it("validates against WeeklyPlanSchema for a populated plan", () => {
    const plan = buildWeeklyPlan({
      user_id: USER_ID,
      track_slug: TRACK_SLUG,
      today: WEDNESDAY_NOON,
      conceptGraph: makeFakeGraph(),
      recentEpisodes: [],
      dueReviews: [{ concept_slug: "python.basics.lists" }],
    });
    const parsed = WeeklyPlanSchema.safeParse(plan);
    expect(parsed.success).toBe(true);
  });

  it("propagates due_reviews_count from the input", () => {
    const plan = buildWeeklyPlan({
      user_id: USER_ID,
      track_slug: TRACK_SLUG,
      today: WEDNESDAY_NOON,
      conceptGraph: makeFakeGraph(),
      recentEpisodes: [],
      dueReviews: [
        { concept_slug: "python.basics.variables" },
        { concept_slug: "python.basics.lists" },
      ],
    });
    expect(plan.due_reviews_count).toBe(2);
  });
});

describe("buildWeeklyPlan — adaptive pace adjustments", () => {
  it("annotates the plan with a 'behind' adjustment when fewer than 2 passes in last 7 days", () => {
    const plan = buildWeeklyPlan({
      user_id: USER_ID,
      track_slug: TRACK_SLUG,
      today: WEDNESDAY_NOON,
      conceptGraph: makeFakeGraph(),
      recentEpisodes: [],
      dueReviews: [],
    });
    expect(plan.dampening.adaptive_adjustment_reason).toMatch(/missed/i);
  });

  it("annotates the plan with an 'accelerated' adjustment when 10+ passes in last 7 days", () => {
    const recent: WeeklyPlanRecentEpisode[] = [];
    for (let i = 0; i < 12; i++) {
      recent.push(
        passEp("python.basics.variables", new Date(WEDNESDAY_NOON.getTime() - i * 86400_000 / 2)),
      );
    }
    const plan = buildWeeklyPlan({
      user_id: USER_ID,
      track_slug: TRACK_SLUG,
      today: WEDNESDAY_NOON,
      conceptGraph: makeFakeGraph(),
      recentEpisodes: recent,
      dueReviews: [],
    });
    expect(plan.dampening.adaptive_adjustment_reason).toMatch(/ahead of pace/i);
    // accelerated pace expands theme_concepts to MAX (5).
    expect(plan.theme_concepts.length).toBe(5);
  });

  it("does not annotate when pace is on-pace (2-9 passes in last 7 days)", () => {
    const recent: WeeklyPlanRecentEpisode[] = [];
    for (let i = 0; i < 5; i++) {
      recent.push(
        passEp("python.basics.variables", new Date(WEDNESDAY_NOON.getTime() - i * 86400_000)),
      );
    }
    const plan = buildWeeklyPlan({
      user_id: USER_ID,
      track_slug: TRACK_SLUG,
      today: WEDNESDAY_NOON,
      conceptGraph: makeFakeGraph(),
      recentEpisodes: recent,
      dueReviews: [],
    });
    expect(plan.dampening.adaptive_adjustment_reason).toBeUndefined();
  });

  it("only counts passes within the last 7 days for pace classification", () => {
    // 12 passes, but all >7 days ago — should classify as 'behind' (0 recent passes).
    const old = new Date(WEDNESDAY_NOON.getTime() - 30 * 86400_000);
    const recent: WeeklyPlanRecentEpisode[] = [];
    for (let i = 0; i < 12; i++) {
      recent.push(passEp("python.basics.variables", old));
    }
    const plan = buildWeeklyPlan({
      user_id: USER_ID,
      track_slug: TRACK_SLUG,
      today: WEDNESDAY_NOON,
      conceptGraph: makeFakeGraph(),
      recentEpisodes: recent,
      dueReviews: [],
    });
    expect(plan.dampening.adaptive_adjustment_reason).toMatch(/missed/i);
  });
});

describe("buildWeeklyPlan — re-plan dampening", () => {
  it("suppresses replan when the user missed only 1 day on a weekday", () => {
    const planCreated = new Date("2026-04-28T10:00:00Z"); // Tuesday
    const plan = buildWeeklyPlan({
      user_id: USER_ID,
      track_slug: TRACK_SLUG,
      today: WEDNESDAY_NOON,
      conceptGraph: makeFakeGraph(),
      recentEpisodes: [],
      dueReviews: [],
      regenerate: true,
      previousPlanCreatedAt: planCreated,
      episodesTodayCount: 0,
    });
    expect(plan.dampening.suppressed_replan_reason).toBe(SUPPRESSED_REPLAN_ONE_DAY_WEEKLY);
  });

  it("allows replan when the user missed 2 weekdays in a row", () => {
    const planCreated = new Date("2026-04-27T10:00:00Z"); // Monday
    const plan = buildWeeklyPlan({
      user_id: USER_ID,
      track_slug: TRACK_SLUG,
      today: WEDNESDAY_NOON,
      conceptGraph: makeFakeGraph(),
      recentEpisodes: [],
      dueReviews: [],
      regenerate: true,
      previousPlanCreatedAt: planCreated,
      episodesTodayCount: 0,
    });
    expect(plan.dampening.suppressed_replan_reason).toBeUndefined();
  });

  it("suppresses replan on a Saturday regardless of plan age", () => {
    const planCreated = new Date("2026-04-25T10:00:00Z");
    const plan = buildWeeklyPlan({
      user_id: USER_ID,
      track_slug: TRACK_SLUG,
      today: SATURDAY_NOON,
      conceptGraph: makeFakeGraph(),
      recentEpisodes: [],
      dueReviews: [],
      regenerate: true,
      previousPlanCreatedAt: planCreated,
      episodesTodayCount: 0,
    });
    expect(plan.dampening.suppressed_replan_reason).toBe(SUPPRESSED_REPLAN_WEEKEND_WEEKLY);
  });

  it("suppresses replan on a Sunday regardless of plan age", () => {
    const planCreated = new Date("2026-04-25T10:00:00Z");
    const plan = buildWeeklyPlan({
      user_id: USER_ID,
      track_slug: TRACK_SLUG,
      today: SUNDAY_NOON,
      conceptGraph: makeFakeGraph(),
      recentEpisodes: [],
      dueReviews: [],
      regenerate: true,
      previousPlanCreatedAt: planCreated,
      episodesTodayCount: 0,
    });
    expect(plan.dampening.suppressed_replan_reason).toBe(SUPPRESSED_REPLAN_WEEKEND_WEEKLY);
  });

  it("allows replan when episodes were done today (active user)", () => {
    const planCreated = new Date("2026-04-28T10:00:00Z");
    const plan = buildWeeklyPlan({
      user_id: USER_ID,
      track_slug: TRACK_SLUG,
      today: WEDNESDAY_NOON,
      conceptGraph: makeFakeGraph(),
      recentEpisodes: [],
      dueReviews: [],
      regenerate: true,
      previousPlanCreatedAt: planCreated,
      episodesTodayCount: 3,
    });
    expect(plan.dampening.suppressed_replan_reason).toBeUndefined();
  });

  it("does NOT set dampening on a non-regenerate read", () => {
    const planCreated = new Date("2026-04-28T10:00:00Z");
    const plan = buildWeeklyPlan({
      user_id: USER_ID,
      track_slug: TRACK_SLUG,
      today: WEDNESDAY_NOON,
      conceptGraph: makeFakeGraph(),
      recentEpisodes: [],
      dueReviews: [],
      previousPlanCreatedAt: planCreated,
      episodesTodayCount: 0,
    });
    expect(plan.dampening.suppressed_replan_reason).toBeUndefined();
  });

  it("does NOT set dampening when there's no previous plan to suppress against", () => {
    const plan = buildWeeklyPlan({
      user_id: USER_ID,
      track_slug: TRACK_SLUG,
      today: WEDNESDAY_NOON,
      conceptGraph: makeFakeGraph(),
      recentEpisodes: [],
      dueReviews: [],
      regenerate: true,
    });
    expect(plan.dampening.suppressed_replan_reason).toBeUndefined();
  });
});

describe("buildWeeklyPlan — role bias", () => {
  it("bubbles role-tagged candidates toward the front when target_role matches", () => {
    // We mark some passed concepts so the picker walks past variables/lists/for-loops and picks
    // among list-comprehensions / generators / dicts. dicts has tag 'data-modeling'; bias should
    // put it first.
    const recent = [
      passEp("python.basics.variables", new Date("2026-04-28T10:00:00Z")),
      passEp("python.basics.lists", new Date("2026-04-28T11:00:00Z")),
      passEp("python.basics.for-loops", new Date("2026-04-28T12:00:00Z")),
    ];
    const plan = buildWeeklyPlan({
      user_id: USER_ID,
      track_slug: TRACK_SLUG,
      today: WEDNESDAY_NOON,
      conceptGraph: makeFakeGraph(),
      recentEpisodes: recent,
      dueReviews: [],
      targetRole: "data-modeling",
    });
    // 'list-comprehensions' and 'dicts' are tagged data-modeling. They should be first in the
    // theme_concepts list (bubbled to front).
    expect(plan.theme_concepts[0]).toMatch(/list-comprehensions|dicts/);
  });

  it("does not change ordering when no candidate matches the role", () => {
    const plan = buildWeeklyPlan({
      user_id: USER_ID,
      track_slug: TRACK_SLUG,
      today: WEDNESDAY_NOON,
      conceptGraph: makeFakeGraph(),
      recentEpisodes: [],
      dueReviews: [],
      targetRole: "no-such-role-tag",
    });
    expect(plan.theme_concept_slug).toBe("python.basics.variables");
  });

  it("treats null target_role as no bias", () => {
    const plan = buildWeeklyPlan({
      user_id: USER_ID,
      track_slug: TRACK_SLUG,
      today: WEDNESDAY_NOON,
      conceptGraph: makeFakeGraph(),
      recentEpisodes: [],
      dueReviews: [],
      targetRole: null,
    });
    expect(plan.theme_concept_slug).toBe("python.basics.variables");
  });
});

describe("computeWeeklyDampeningReason — pure helper", () => {
  it("returns the 1-day-miss reason for plan_age=1 weekday no episodes", () => {
    const reason = computeWeeklyDampeningReason({
      now: WEDNESDAY_NOON,
      planCreatedAt: new Date("2026-04-28T10:00:00Z"),
      episodesTodayCount: 0,
    });
    expect(reason).toBe(SUPPRESSED_REPLAN_ONE_DAY_WEEKLY);
  });

  it("returns the weekend reason on Saturday", () => {
    const reason = computeWeeklyDampeningReason({
      now: SATURDAY_NOON,
      planCreatedAt: new Date("2026-04-30T10:00:00Z"),
      episodesTodayCount: 0,
    });
    expect(reason).toBe(SUPPRESSED_REPLAN_WEEKEND_WEEKLY);
  });

  it("returns null when plan_age >= 2 weekdays + no episodes today", () => {
    const reason = computeWeeklyDampeningReason({
      now: WEDNESDAY_NOON,
      planCreatedAt: new Date("2026-04-27T10:00:00Z"),
      episodesTodayCount: 0,
    });
    expect(reason).toBeNull();
  });

  it("returns null when at least 1 episode happened today", () => {
    const reason = computeWeeklyDampeningReason({
      now: WEDNESDAY_NOON,
      planCreatedAt: new Date("2026-04-28T10:00:00Z"),
      episodesTodayCount: 1,
    });
    expect(reason).toBeNull();
  });

  it("returns the weekend reason on Sunday before checking plan age", () => {
    const reason = computeWeeklyDampeningReason({
      now: SUNDAY_NOON,
      planCreatedAt: new Date("2026-04-28T10:00:00Z"),
      episodesTodayCount: 0,
    });
    expect(reason).toBe(SUPPRESSED_REPLAN_WEEKEND_WEEKLY);
  });
});

describe("reasoningForDailyConcept — coach-voice copy", () => {
  it("emits a 'theme of the week' message for the dominant concept", () => {
    const text = reasoningForDailyConcept({
      conceptName: "List comprehensions",
      themeConceptName: "List comprehensions",
      dayIndex: 0,
    });
    expect(text).toContain("Theme of the week");
  });

  it("emits a 'change of pace' message on weekend days for non-theme concepts", () => {
    const text = reasoningForDailyConcept({
      conceptName: "Generators",
      themeConceptName: "List comprehensions",
      dayIndex: 5,
    });
    expect(text.toLowerCase()).toContain("change of pace");
  });

  it("emits a 'builds on' message on weekday days for non-theme concepts", () => {
    const text = reasoningForDailyConcept({
      conceptName: "Generators",
      themeConceptName: "List comprehensions",
      dayIndex: 2,
    });
    expect(text).toContain("Builds on");
  });

  it("never emits forbidden urgency / shame / FOMO phrases", () => {
    const forbidden = ["DON'T LOSE", "DAY X", "BURN", "🔥", "⚠️", "fading", "forget"];
    const messages = [
      reasoningForDailyConcept({
        conceptName: "List comprehensions",
        themeConceptName: "List comprehensions",
        dayIndex: 0,
      }),
      reasoningForDailyConcept({
        conceptName: "Generators",
        themeConceptName: "List comprehensions",
        dayIndex: 5,
      }),
      reasoningForDailyConcept({
        conceptName: "Generators",
        themeConceptName: "List comprehensions",
        dayIndex: 2,
      }),
    ];
    for (const msg of messages) {
      for (const phrase of forbidden) {
        expect(msg).not.toContain(phrase);
      }
    }
  });
});

describe("buildWeeklyPlan — scheme: cycle in graph falls back gracefully", () => {
  it("does not throw when the graph contains a cycle", () => {
    const cyclic: WeeklyPlanConceptGraph = {
      concepts: [
        {
          slug: "a",
          name: "A",
          track_slugs: ["python-fundamentals"],
          tags: [],
        },
        {
          slug: "b",
          name: "B",
          track_slugs: ["python-fundamentals"],
          tags: [],
        },
      ],
      edges: [
        { from: "a", to: "b" },
        { from: "b", to: "a" },
      ],
    };
    const plan = buildWeeklyPlan({
      user_id: USER_ID,
      track_slug: TRACK_SLUG,
      today: WEDNESDAY_NOON,
      conceptGraph: cyclic,
      recentEpisodes: [],
      dueReviews: [],
    });
    expect(plan.theme_concepts.length).toBeGreaterThan(0);
  });
});

describe("buildWeeklyPlan — coach-voice copy across the whole plan", () => {
  it("never emits forbidden phrases on theme / dampening / daily reasoning text", () => {
    const forbidden = ["DON'T LOSE", "BURN", "🔥", "⚠️", "lose", "fading", "shame"];
    const plan = buildWeeklyPlan({
      user_id: USER_ID,
      track_slug: TRACK_SLUG,
      today: WEDNESDAY_NOON,
      conceptGraph: makeFakeGraph(),
      recentEpisodes: [],
      dueReviews: [],
      regenerate: true,
      previousPlanCreatedAt: new Date("2026-04-28T10:00:00Z"),
      episodesTodayCount: 0,
    });
    const allText = [
      plan.theme,
      plan.dampening.suppressed_replan_reason ?? "",
      plan.dampening.adaptive_adjustment_reason ?? "",
      ...plan.daily_concepts.map((d) => d.reasoning),
    ].join("\n");
    for (const phrase of forbidden) {
      expect(allText).not.toContain(phrase);
    }
  });
});
