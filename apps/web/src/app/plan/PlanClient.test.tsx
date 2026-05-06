/**
 * @vitest-environment jsdom
 */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlanClient } from "./PlanClient";
import type { TodayPlanShape } from "./plan-view.js";

void React;

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.restoreAllMocks();
});

function makePlan(overrides: Partial<TodayPlanShape> = {}): TodayPlanShape {
  return {
    date: "2026-04-29",
    review_items: [],
    session_plan_items: [],
    episodes_today_count: 0,
    session_plan_id: null,
    dampening: {},
    ...overrides,
  };
}

function mockFetch(response: { status?: number; body: unknown } | { throws: true }): void {
  globalThis.fetch = vi.fn(async () => {
    if ("throws" in response) {
      throw new Error("simulated network failure");
    }
    return new Response(JSON.stringify(response.body), {
      status: response.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

describe("PlanClient — re-plan button (STORY-046)", () => {
  it("renders the initial plan and a re-plan button", async () => {
    await act(async () => {
      root.render(<PlanClient initialPlan={makePlan()} activeTrackSlug="python-fundamentals" />);
    });
    const button = container.querySelector(
      '[data-testid="replan-button"]',
    ) as HTMLButtonElement | null;
    expect(button).not.toBeNull();
    expect(button?.textContent).toBe("Re-plan");
    // Reasoning panel renders when a plan is supplied (even an empty one).
    expect(container.querySelector('[data-testid="plan-reasoning-panel"]')).not.toBeNull();
  });

  it("shows the dampened banner when /api/today-plan/replan returns dampened: true", async () => {
    mockFetch({
      body: {
        today_plan: makePlan(),
        dampened: true,
        reason: "Only one day missed — your plan still applies.",
      },
    });
    await act(async () => {
      root.render(<PlanClient initialPlan={makePlan()} activeTrackSlug="python-fundamentals" />);
    });
    const button = container.querySelector('[data-testid="replan-button"]') as HTMLButtonElement;
    await act(async () => {
      button.click();
    });
    const banner = container.querySelector('[data-testid="replan-banner-dampened"]');
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain("Only one day missed");
  });

  it("shows the regenerated message when the planner produces a fresh plan", async () => {
    mockFetch({
      body: {
        today_plan: makePlan({
          session_plan_items: [
            {
              slug: "fresh-1",
              objective: "Fresh objective",
              estimated_duration_min: 8,
              status: "pending",
              reasoning: "Picked by your session planner: Fresh objective",
            },
          ],
        }),
        dampened: false,
      },
    });
    await act(async () => {
      root.render(<PlanClient initialPlan={makePlan()} activeTrackSlug="python-fundamentals" />);
    });
    const button = container.querySelector('[data-testid="replan-button"]') as HTMLButtonElement;
    await act(async () => {
      button.click();
    });
    const banner = container.querySelector('[data-testid="replan-banner-regenerated"]');
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain("Plan refreshed");
    // The fresh plan flowed through.
    expect(container.textContent).toContain("Fresh objective");
  });

  it("shows the error banner when the API returns 503", async () => {
    mockFetch({ status: 503, body: { error: "today_plan_unavailable" } });
    await act(async () => {
      root.render(<PlanClient initialPlan={makePlan()} activeTrackSlug="python-fundamentals" />);
    });
    const button = container.querySelector('[data-testid="replan-button"]') as HTMLButtonElement;
    await act(async () => {
      button.click();
    });
    const banner = container.querySelector('[data-testid="replan-banner-error"]');
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain("briefly unavailable");
  });

  it("shows the error banner when fetch throws (network outage)", async () => {
    mockFetch({ throws: true });
    await act(async () => {
      root.render(<PlanClient initialPlan={makePlan()} activeTrackSlug="python-fundamentals" />);
    });
    const button = container.querySelector('[data-testid="replan-button"]') as HTMLButtonElement;
    await act(async () => {
      button.click();
    });
    const banner = container.querySelector('[data-testid="replan-banner-error"]');
    expect(banner).not.toBeNull();
    // textContent uses raw apostrophes (no HTML entity escaping).
    expect(banner?.textContent).toContain("Couldn't reach the planner");
  });

  it("does not render the reasoning panel when the initial plan is null", async () => {
    await act(async () => {
      root.render(<PlanClient initialPlan={null} activeTrackSlug={null} />);
    });
    expect(container.querySelector('[data-testid="plan-reasoning-panel"]')).toBeNull();
  });

  it("uses coach voice in all banners (no urgency, shame, or forbidden phrases)", async () => {
    mockFetch({
      body: {
        today_plan: makePlan(),
        dampened: true,
        reason: "Weekends are part of the rhythm — keeping your plan as-is.",
      },
    });
    await act(async () => {
      root.render(<PlanClient initialPlan={makePlan()} activeTrackSlug="python-fundamentals" />);
    });
    const button = container.querySelector('[data-testid="replan-button"]') as HTMLButtonElement;
    await act(async () => {
      button.click();
    });
    const text = container.textContent ?? "";
    for (const phrase of ["DON'T LOSE", "DAY X", "burn", "BURN", "🔥", "⚠️"]) {
      expect(text).not.toContain(phrase);
    }
  });
});
