import { describe, expect, it } from "vitest";
import {
  buildTodayPlan,
  computeDampeningReason,
  reasoningForPlanItem,
  reasoningForReview,
  SUPPRESSED_REPLAN_ONE_DAY,
  SUPPRESSED_REPLAN_WEEKEND,
  TodayPlanSchema,
  type TodayPlanDeps,
} from "./today-plan.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const PLAN_ID = "22222222-2222-4222-8222-222222222222";

interface FakeState {
  activePlan: Awaited<ReturnType<TodayPlanDeps["getLatestActivePlan"]>>;
  dueConcepts: Awaited<ReturnType<TodayPlanDeps["getDueConcepts"]>>;
  todaysEpisodes: number;
}

function fakeDeps(state: FakeState): TodayPlanDeps {
  return {
    async getLatestActivePlan() {
      return state.activePlan;
    },
    async getDueConcepts() {
      return state.dueConcepts;
    },
    async countTodaysEpisodes() {
      return state.todaysEpisodes;
    },
  };
}

// Wednesday at noon UTC — a normal weekday, not in the weekend dampening branch.
const WEDNESDAY_NOON = new Date("2026-04-29T12:00:00Z");
// Saturday at noon UTC — exercises the weekend dampening branch.
const SATURDAY_NOON = new Date("2026-05-02T12:00:00Z");
// Sunday at noon UTC — exercises the weekend dampening branch.
const SUNDAY_NOON = new Date("2026-05-03T12:00:00Z");

describe("buildTodayPlan — empty state", () => {
  it("returns a fully-empty plan when nothing is due and there is no active session plan", async () => {
    const deps = fakeDeps({ activePlan: null, dueConcepts: [], todaysEpisodes: 0 });
    const plan = await buildTodayPlan({ user_id: USER_ID, now: WEDNESDAY_NOON, deps });
    expect(plan.date).toBe("2026-04-29");
    expect(plan.review_items).toEqual([]);
    expect(plan.session_plan_items).toEqual([]);
    expect(plan.episodes_today_count).toBe(0);
    expect(plan.session_plan_id).toBeNull();
    expect(plan.dampening).toEqual({});
  });

  it("validates against the TodayPlanSchema (Zod boundary)", async () => {
    const deps = fakeDeps({ activePlan: null, dueConcepts: [], todaysEpisodes: 0 });
    const plan = await buildTodayPlan({ user_id: USER_ID, now: WEDNESDAY_NOON, deps });
    const parsed = TodayPlanSchema.safeParse(plan);
    expect(parsed.success).toBe(true);
  });
});

describe("buildTodayPlan — only due reviews", () => {
  it("emits review_items with days_overdue and coach-voice reasoning, no session plan items", async () => {
    const deps = fakeDeps({
      activePlan: null,
      dueConcepts: [
        {
          concept_id: "concept-list-comprehension",
          state: { due: "2026-04-28T10:00:00Z" },
        },
        {
          concept_id: "concept-tuples",
          state: { due: "2026-04-25T10:00:00Z" },
        },
      ],
      todaysEpisodes: 0,
    });
    const plan = await buildTodayPlan({ user_id: USER_ID, now: WEDNESDAY_NOON, deps });
    expect(plan.review_items).toHaveLength(2);
    expect(plan.review_items[0]?.concept_id).toBe("concept-list-comprehension");
    expect(plan.review_items[0]?.days_overdue).toBe(1);
    expect(plan.review_items[1]?.days_overdue).toBe(4);
    expect(plan.session_plan_items).toEqual([]);
    expect(plan.review_items[0]?.reasoning).toContain("1 day ago");
  });

  it("does not crash when due is exactly equal to now (days_overdue === 0)", async () => {
    const deps = fakeDeps({
      activePlan: null,
      dueConcepts: [{ concept_id: "concept-x", state: { due: WEDNESDAY_NOON.toISOString() } }],
      todaysEpisodes: 0,
    });
    const plan = await buildTodayPlan({ user_id: USER_ID, now: WEDNESDAY_NOON, deps });
    expect(plan.review_items[0]?.days_overdue).toBe(0);
    expect(plan.review_items[0]?.reasoning).toContain("Due today");
  });
});

describe("buildTodayPlan — only session plan", () => {
  it("emits session_plan_items derived from the active plan, no review items", async () => {
    const deps = fakeDeps({
      activePlan: {
        id: PLAN_ID,
        user_id: USER_ID,
        created_at: WEDNESDAY_NOON,
        items: [
          {
            slug: "warmup",
            objective: "Refresh list comprehensions",
            estimated_duration_min: 8,
            status: "pending",
          },
          {
            slug: "drill",
            objective: "Practice generators",
            estimated_duration_min: 10,
            status: "pending",
          },
          {
            slug: "stretch",
            objective: "Build a small dict-flattener",
            estimated_duration_min: 7,
            status: "pending",
          },
        ],
      },
      dueConcepts: [],
      todaysEpisodes: 0,
    });
    const plan = await buildTodayPlan({ user_id: USER_ID, now: WEDNESDAY_NOON, deps });
    expect(plan.review_items).toEqual([]);
    expect(plan.session_plan_items).toHaveLength(3);
    expect(plan.session_plan_items[0]?.slug).toBe("warmup");
    expect(plan.session_plan_items[0]?.status).toBe("pending");
    expect(plan.session_plan_items[0]?.reasoning).toContain("Refresh list comprehensions");
    expect(plan.session_plan_id).toBe(PLAN_ID);
  });

  it("preserves item completion status with coach-voice reasoning", async () => {
    const deps = fakeDeps({
      activePlan: {
        id: PLAN_ID,
        user_id: USER_ID,
        created_at: WEDNESDAY_NOON,
        items: [
          {
            slug: "warmup",
            objective: "Refresh list comprehensions",
            estimated_duration_min: 8,
            status: "completed",
          },
        ],
      },
      dueConcepts: [],
      todaysEpisodes: 1,
    });
    const plan = await buildTodayPlan({ user_id: USER_ID, now: WEDNESDAY_NOON, deps });
    expect(plan.session_plan_items[0]?.status).toBe("completed");
    expect(plan.session_plan_items[0]?.reasoning).toContain("Already done");
  });
});

describe("buildTodayPlan — both reviews and session plan", () => {
  it("emits both with the count of episodes done today", async () => {
    const deps = fakeDeps({
      activePlan: {
        id: PLAN_ID,
        user_id: USER_ID,
        created_at: WEDNESDAY_NOON,
        items: [
          {
            slug: "warmup",
            objective: "Warm up",
            estimated_duration_min: 8,
            status: "pending",
          },
        ],
      },
      dueConcepts: [{ concept_id: "concept-y", state: { due: "2026-04-28T10:00:00Z" } }],
      todaysEpisodes: 2,
    });
    const plan = await buildTodayPlan({ user_id: USER_ID, now: WEDNESDAY_NOON, deps });
    expect(plan.review_items).toHaveLength(1);
    expect(plan.session_plan_items).toHaveLength(1);
    expect(plan.episodes_today_count).toBe(2);
    expect(plan.session_plan_id).toBe(PLAN_ID);
  });
});

describe("buildTodayPlan — re-plan dampening", () => {
  it("suppresses replan when the user missed only 1 day on a weekday", async () => {
    // Plan was created 1 calendar day ago, no episodes today, weekday → suppressed.
    const planCreated = new Date("2026-04-28T10:00:00Z"); // Tuesday
    const deps = fakeDeps({
      activePlan: {
        id: PLAN_ID,
        user_id: USER_ID,
        created_at: planCreated,
        items: [{ slug: "x", objective: "X", estimated_duration_min: 8, status: "pending" }],
      },
      dueConcepts: [],
      todaysEpisodes: 0,
    });
    const plan = await buildTodayPlan({
      user_id: USER_ID,
      now: WEDNESDAY_NOON,
      deps,
      regenerate: true,
    });
    expect(plan.dampening.suppressed_replan_reason).toBe(SUPPRESSED_REPLAN_ONE_DAY);
  });

  it("allows replan to fire when the user missed 2 weekdays in a row", async () => {
    // Plan was created Mon, now is Wed, no episodes today → 2 missed days, weekday → not suppressed.
    const planCreated = new Date("2026-04-27T10:00:00Z"); // Monday
    const deps = fakeDeps({
      activePlan: {
        id: PLAN_ID,
        user_id: USER_ID,
        created_at: planCreated,
        items: [{ slug: "x", objective: "X", estimated_duration_min: 8, status: "pending" }],
      },
      dueConcepts: [],
      todaysEpisodes: 0,
    });
    const plan = await buildTodayPlan({
      user_id: USER_ID,
      now: WEDNESDAY_NOON,
      deps,
      regenerate: true,
    });
    expect(plan.dampening.suppressed_replan_reason).toBeUndefined();
  });

  it("suppresses replan on a Saturday regardless of plan age", async () => {
    const planCreated = new Date("2026-04-25T10:00:00Z");
    const deps = fakeDeps({
      activePlan: {
        id: PLAN_ID,
        user_id: USER_ID,
        created_at: planCreated,
        items: [{ slug: "x", objective: "X", estimated_duration_min: 8, status: "pending" }],
      },
      dueConcepts: [],
      todaysEpisodes: 0,
    });
    const plan = await buildTodayPlan({
      user_id: USER_ID,
      now: SATURDAY_NOON,
      deps,
      regenerate: true,
    });
    expect(plan.dampening.suppressed_replan_reason).toBe(SUPPRESSED_REPLAN_WEEKEND);
  });

  it("suppresses replan on a Sunday regardless of plan age", async () => {
    const planCreated = new Date("2026-04-25T10:00:00Z");
    const deps = fakeDeps({
      activePlan: {
        id: PLAN_ID,
        user_id: USER_ID,
        created_at: planCreated,
        items: [{ slug: "x", objective: "X", estimated_duration_min: 8, status: "pending" }],
      },
      dueConcepts: [],
      todaysEpisodes: 0,
    });
    const plan = await buildTodayPlan({
      user_id: USER_ID,
      now: SUNDAY_NOON,
      deps,
      regenerate: true,
    });
    expect(plan.dampening.suppressed_replan_reason).toBe(SUPPRESSED_REPLAN_WEEKEND);
  });

  it("allows replan when episodes were done today (active user, fresh plan justified)", async () => {
    const planCreated = new Date("2026-04-27T10:00:00Z");
    const deps = fakeDeps({
      activePlan: {
        id: PLAN_ID,
        user_id: USER_ID,
        created_at: planCreated,
        items: [{ slug: "x", objective: "X", estimated_duration_min: 8, status: "pending" }],
      },
      dueConcepts: [],
      todaysEpisodes: 3,
    });
    const plan = await buildTodayPlan({
      user_id: USER_ID,
      now: WEDNESDAY_NOON,
      deps,
      regenerate: true,
    });
    expect(plan.dampening.suppressed_replan_reason).toBeUndefined();
  });

  it("does NOT set dampening on a non-regenerate read even when conditions match", async () => {
    const planCreated = new Date("2026-04-28T10:00:00Z");
    const deps = fakeDeps({
      activePlan: {
        id: PLAN_ID,
        user_id: USER_ID,
        created_at: planCreated,
        items: [{ slug: "x", objective: "X", estimated_duration_min: 8, status: "pending" }],
      },
      dueConcepts: [],
      todaysEpisodes: 0,
    });
    // No `regenerate` flag → no dampening signal even though it would suppress.
    const plan = await buildTodayPlan({ user_id: USER_ID, now: WEDNESDAY_NOON, deps });
    expect(plan.dampening).toEqual({});
  });

  it("does NOT set dampening when there's no active plan to suppress against", async () => {
    const deps = fakeDeps({ activePlan: null, dueConcepts: [], todaysEpisodes: 0 });
    const plan = await buildTodayPlan({
      user_id: USER_ID,
      now: WEDNESDAY_NOON,
      deps,
      regenerate: true,
    });
    expect(plan.dampening).toEqual({});
  });
});

describe("computeDampeningReason — pure helper", () => {
  it("returns SUPPRESSED_REPLAN_ONE_DAY for plan_age=1 weekday no episodes", () => {
    const reason = computeDampeningReason({
      now: WEDNESDAY_NOON,
      planCreatedAt: new Date("2026-04-28T10:00:00Z"),
      episodesTodayCount: 0,
    });
    expect(reason).toBe(SUPPRESSED_REPLAN_ONE_DAY);
  });

  it("returns SUPPRESSED_REPLAN_WEEKEND on Saturday", () => {
    const reason = computeDampeningReason({
      now: SATURDAY_NOON,
      planCreatedAt: new Date("2026-04-30T10:00:00Z"),
      episodesTodayCount: 0,
    });
    expect(reason).toBe(SUPPRESSED_REPLAN_WEEKEND);
  });

  it("returns null when plan_age >= 2 weekdays + no episodes today", () => {
    const reason = computeDampeningReason({
      now: WEDNESDAY_NOON,
      planCreatedAt: new Date("2026-04-27T10:00:00Z"),
      episodesTodayCount: 0,
    });
    expect(reason).toBeNull();
  });

  it("returns null when at least 1 episode happened today", () => {
    const reason = computeDampeningReason({
      now: WEDNESDAY_NOON,
      planCreatedAt: new Date("2026-04-28T10:00:00Z"),
      episodesTodayCount: 1,
    });
    expect(reason).toBeNull();
  });

  it("returns SUPPRESSED_REPLAN_ONE_DAY when plan was created today (plan_age=0)", () => {
    const reason = computeDampeningReason({
      now: WEDNESDAY_NOON,
      planCreatedAt: new Date("2026-04-29T08:00:00Z"),
      episodesTodayCount: 0,
    });
    expect(reason).toBe(SUPPRESSED_REPLAN_ONE_DAY);
  });

  it("returns SUPPRESSED_REPLAN_WEEKEND on Sunday before checking plan age", () => {
    // Plan is 5 days old — would normally allow replan. But Sunday wins.
    const reason = computeDampeningReason({
      now: SUNDAY_NOON,
      planCreatedAt: new Date("2026-04-28T10:00:00Z"),
      episodesTodayCount: 0,
    });
    expect(reason).toBe(SUPPRESSED_REPLAN_WEEKEND);
  });
});

describe("reasoningForReview — coach-voice copy", () => {
  it("emits a 'due today' message when days_overdue is 0", () => {
    expect(reasoningForReview(0)).toContain("Due today");
  });

  it("emits a singular '1 day ago' message", () => {
    expect(reasoningForReview(1)).toContain("1 day ago");
  });

  it("emits a plural 'N days ago' message for higher counts", () => {
    expect(reasoningForReview(5)).toContain("5 days ago");
  });

  it("never emits forbidden urgency / shame phrases", () => {
    const forbidden = ["DON'T LOSE", "burn", "fading", "forget", "🔥", "⚠️"];
    for (const days of [0, 1, 2, 5, 30]) {
      const text = reasoningForReview(days);
      for (const phrase of forbidden) {
        expect(text).not.toContain(phrase);
      }
    }
  });
});

describe("reasoningForPlanItem — coach-voice copy", () => {
  it("emits an 'Already done' message for completed items", () => {
    const r = reasoningForPlanItem({ objective: "Solve x", status: "completed" });
    expect(r).toContain("Already done");
  });

  it("emits a 'Picked by your session planner' message for pending items", () => {
    const r = reasoningForPlanItem({ objective: "Solve x", status: "pending" });
    expect(r).toContain("Picked by your session planner");
  });
});

describe("buildTodayPlan — date computation", () => {
  it("emits an ISO yyyy-mm-dd date string in UTC", async () => {
    const deps = fakeDeps({ activePlan: null, dueConcepts: [], todaysEpisodes: 0 });
    const plan = await buildTodayPlan({
      user_id: USER_ID,
      now: new Date("2026-12-31T23:30:00Z"),
      deps,
    });
    expect(plan.date).toBe("2026-12-31");
  });

  it("zero-pads month and day", async () => {
    const deps = fakeDeps({ activePlan: null, dueConcepts: [], todaysEpisodes: 0 });
    const plan = await buildTodayPlan({
      user_id: USER_ID,
      now: new Date("2026-01-05T08:00:00Z"),
      deps,
    });
    expect(plan.date).toBe("2026-01-05");
  });
});
