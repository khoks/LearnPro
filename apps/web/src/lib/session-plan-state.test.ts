import { describe, expect, it } from "vitest";
import {
  completedCount,
  initialPlanState,
  pendingCount,
  planReducer,
  totalDurationMin,
  type SessionPlan,
} from "./session-plan-state";

function plan(overrides: Partial<SessionPlan> = {}): SessionPlan {
  return {
    id: "plan-1",
    user_id: "user-1",
    created_at: "2026-05-03T10:00:00Z",
    expires_at: "2026-05-04T10:00:00Z",
    time_budget_min: 25,
    items: [
      { slug: "warmup", objective: "Warm up", estimated_duration_min: 8, status: "pending" },
      { slug: "drill", objective: "Drill", estimated_duration_min: 10, status: "pending" },
      { slug: "stretch", objective: "Stretch", estimated_duration_min: 7, status: "pending" },
    ],
    ...overrides,
  };
}

describe("planReducer", () => {
  it("starts in loading", () => {
    expect(initialPlanState.phase).toBe("loading");
  });

  it("load_succeeded with a plan → ready", () => {
    const next = planReducer(initialPlanState, {
      type: "load_succeeded",
      plan: plan(),
      fallback: false,
    });
    expect(next.phase).toBe("ready");
    if (next.phase === "ready") {
      expect(next.plan.items).toHaveLength(3);
      expect(next.fallback).toBe(false);
    }
  });

  it("load_succeeded with null plan → empty", () => {
    const next = planReducer(initialPlanState, {
      type: "load_succeeded",
      plan: null,
      fallback: false,
    });
    expect(next.phase).toBe("empty");
  });

  it("load_succeeded surfaces the fallback flag", () => {
    const next = planReducer(initialPlanState, {
      type: "load_succeeded",
      plan: plan(),
      fallback: true,
    });
    if (next.phase !== "ready") throw new Error("expected ready");
    expect(next.fallback).toBe(true);
  });

  it("load_failed → error with the supplied message", () => {
    const next = planReducer(initialPlanState, {
      type: "load_failed",
      message: "Couldn't reach the plan service.",
    });
    if (next.phase !== "error") throw new Error("expected error");
    expect(next.message).toBe("Couldn't reach the plan service.");
  });

  it("item_marked replaces the plan and clears the fallback flag", () => {
    const start = planReducer(initialPlanState, {
      type: "load_succeeded",
      plan: plan(),
      fallback: true,
    });
    const updated = plan({
      items: [
        {
          slug: "warmup",
          objective: "Warm up",
          estimated_duration_min: 8,
          status: "completed",
          episode_id: "ep-1",
        },
        { slug: "drill", objective: "Drill", estimated_duration_min: 10, status: "pending" },
        { slug: "stretch", objective: "Stretch", estimated_duration_min: 7, status: "pending" },
      ],
    });
    const next = planReducer(start, { type: "item_marked", plan: updated });
    if (next.phase !== "ready") throw new Error("expected ready");
    expect(next.fallback).toBe(false);
    expect(next.plan.items[0]?.status).toBe("completed");
  });

  it("skip → skipped (sidebar hides)", () => {
    const next = planReducer(initialPlanState, { type: "skip" });
    expect(next.phase).toBe("skipped");
  });

  it("reset → loading (re-initialise after a track switch)", () => {
    const start = planReducer(initialPlanState, {
      type: "load_succeeded",
      plan: plan(),
      fallback: false,
    });
    const next = planReducer(start, { type: "reset" });
    expect(next.phase).toBe("loading");
  });
});

describe("plan helpers", () => {
  it("pendingCount + completedCount add up to total", () => {
    const p = plan({
      items: [
        {
          slug: "a",
          objective: "A",
          estimated_duration_min: 5,
          status: "completed",
          episode_id: "ep-1",
        },
        { slug: "b", objective: "B", estimated_duration_min: 5, status: "pending" },
        { slug: "c", objective: "C", estimated_duration_min: 5, status: "pending" },
      ],
    });
    expect(pendingCount(p)).toBe(2);
    expect(completedCount(p)).toBe(1);
    expect(pendingCount(p) + completedCount(p)).toBe(p.items.length);
  });

  it("totalDurationMin sums every item's estimated_duration_min", () => {
    expect(totalDurationMin(plan())).toBe(25);
  });
});
