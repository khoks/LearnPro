import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SessionPlanSidebar } from "./SessionPlanSidebar.js";
import type { SessionPlan } from "../../lib/session-plan-state.js";

void React;

function plan(overrides: Partial<SessionPlan> = {}): SessionPlan {
  return {
    id: "plan-1",
    user_id: "user-1",
    created_at: "2026-05-03T10:00:00Z",
    expires_at: "2026-05-04T10:00:00Z",
    time_budget_min: 25,
    items: [
      {
        slug: "warmup",
        objective: "Warm up exercise",
        estimated_duration_min: 8,
        status: "pending",
      },
      {
        slug: "drill",
        objective: "Drill list comp",
        estimated_duration_min: 10,
        status: "pending",
      },
      {
        slug: "stretch",
        objective: "Stretch problem",
        estimated_duration_min: 7,
        status: "pending",
      },
    ],
    ...overrides,
  };
}

const noopSkip = (): void => {};

describe("SessionPlanSidebar (STORY-015)", () => {
  it("loading: renders skeleton and a Skip plan link", () => {
    const html = renderToStaticMarkup(
      <SessionPlanSidebar state={{ phase: "loading" }} onSkip={noopSkip} />,
    );
    expect(html).toContain("Today");
    expect(html).toContain("Skip plan");
  });

  it("skipped: renders nothing (sidebar hides)", () => {
    const html = renderToStaticMarkup(
      <SessionPlanSidebar state={{ phase: "skipped" }} onSkip={noopSkip} />,
    );
    expect(html).toBe("");
  });

  it("ready: renders pending items with [ ] checkbox + minutes", () => {
    const html = renderToStaticMarkup(
      <SessionPlanSidebar
        state={{ phase: "ready", plan: plan(), fallback: false }}
        onSkip={noopSkip}
      />,
    );
    expect(html).toContain("[ ]");
    expect(html).toContain("Warm up exercise");
    expect(html).toContain("~8min");
    expect(html).toContain("0/3 done");
  });

  it("ready: completed items render with [x] + slug + line-through styling", () => {
    const completedPlan = plan({
      items: [
        {
          slug: "warmup",
          objective: "Warm up exercise",
          estimated_duration_min: 8,
          status: "completed",
          episode_id: "ep-1",
        },
        {
          slug: "drill",
          objective: "Drill list comp",
          estimated_duration_min: 10,
          status: "pending",
        },
        {
          slug: "stretch",
          objective: "Stretch problem",
          estimated_duration_min: 7,
          status: "pending",
        },
      ],
    });
    const html = renderToStaticMarkup(
      <SessionPlanSidebar
        state={{ phase: "ready", plan: completedPlan, fallback: false }}
        onSkip={noopSkip}
      />,
    );
    expect(html).toContain("[x]");
    expect(html).toContain("warmup"); // completed slug shows
    expect(html).toContain("line-through");
    expect(html).toContain("1/3 done");
  });

  it("ready: fallback flag shows the 'fallback' badge", () => {
    const html = renderToStaticMarkup(
      <SessionPlanSidebar
        state={{ phase: "ready", plan: plan(), fallback: true }}
        onSkip={noopSkip}
      />,
    );
    expect(html).toContain("fallback");
  });

  it("empty: shows the 'no plan yet' copy + Skip plan link", () => {
    const html = renderToStaticMarkup(
      <SessionPlanSidebar state={{ phase: "empty" }} onSkip={noopSkip} />,
    );
    expect(html).toContain("No plan yet");
    expect(html).toContain("Skip plan");
  });

  it("error: shows the message + an optional Retry button", () => {
    const onRetry = (): void => {};
    const html = renderToStaticMarkup(
      <SessionPlanSidebar
        state={{ phase: "error", message: "Couldn't reach the plan service." }}
        onSkip={noopSkip}
        onRetry={onRetry}
      />,
    );
    expect(html).toContain("Couldn&#x27;t reach the plan service.");
    expect(html).toContain("Retry");
  });

  it("ready: when all items are completed, no Skip plan link is rendered", () => {
    const completedAll = plan({
      items: [
        {
          slug: "warmup",
          objective: "Warm up",
          estimated_duration_min: 8,
          status: "completed",
          episode_id: "ep-1",
        },
        {
          slug: "drill",
          objective: "Drill",
          estimated_duration_min: 10,
          status: "completed",
          episode_id: "ep-2",
        },
        {
          slug: "stretch",
          objective: "Stretch",
          estimated_duration_min: 7,
          status: "completed",
          episode_id: "ep-3",
        },
      ],
    });
    const html = renderToStaticMarkup(
      <SessionPlanSidebar
        state={{ phase: "ready", plan: completedAll, fallback: false }}
        onSkip={noopSkip}
      />,
    );
    expect(html).not.toContain("Skip plan");
    expect(html).toContain("3/3 done");
  });
});
