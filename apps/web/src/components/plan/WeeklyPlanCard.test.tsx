/**
 * @vitest-environment jsdom
 */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  WeeklyPlanCard,
  type WeeklyPlanLoadResult,
  type WeeklyPlanShape,
} from "./WeeklyPlanCard.js";

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

function makePlan(overrides: Partial<WeeklyPlanShape> = {}): WeeklyPlanShape {
  return {
    week_start_date: "2026-04-27",
    theme: "List comprehensions week",
    theme_concept_slug: "python.basics.list-comprehensions",
    daily_concepts: [
      {
        day_index: 0,
        concept_slug: "python.basics.list-comprehensions",
        reasoning: "Theme of the week — keep coming back so it sticks.",
      },
      {
        day_index: 1,
        concept_slug: "python.basics.generators",
        reasoning: "Builds on List comprehensions; keeps the chain solid.",
      },
      {
        day_index: 2,
        concept_slug: "python.basics.list-comprehensions",
        reasoning: "Theme of the week — keep coming back so it sticks.",
      },
      {
        day_index: 3,
        concept_slug: "python.basics.generators",
        reasoning: "Builds on List comprehensions; keeps the chain solid.",
      },
      {
        day_index: 4,
        concept_slug: "python.basics.list-comprehensions",
        reasoning: "Theme of the week — keep coming back so it sticks.",
      },
      {
        day_index: 5,
        concept_slug: "python.basics.generators",
        reasoning: "A change of pace within the theme — light practice.",
      },
      {
        day_index: 6,
        concept_slug: "python.basics.list-comprehensions",
        reasoning: "Theme of the week — keep coming back so it sticks.",
      },
    ],
    theme_concepts: ["python.basics.list-comprehensions", "python.basics.generators"],
    due_reviews_count: 0,
    dampening: {},
    ...overrides,
  };
}

function mockFetch(response: { status?: number; body: unknown } | { throws: true }): typeof fetch {
  return vi.fn(async () => {
    if ("throws" in response) {
      throw new Error("simulated network failure");
    }
    return new Response(JSON.stringify(response.body), {
      status: response.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

describe("WeeklyPlanCard — populated plan", () => {
  it("renders the theme + week_start_date + 7-day grid", async () => {
    const initial: WeeklyPlanLoadResult = {
      status: "ok",
      plan: makePlan(),
      track_slug: "python-fundamentals",
    };
    await act(async () => {
      root.render(<WeeklyPlanCard initial={initial} />);
    });
    const themeEl = container.querySelector('[data-testid="weekly-plan-theme"]');
    expect(themeEl?.textContent).toBe("List comprehensions week");
    expect(container.textContent).toContain("Week of 2026-04-27");
    const grid = container.querySelector('[data-testid="weekly-plan-day-grid"]');
    expect(grid?.children.length).toBe(7);
  });

  it("renders day labels Mon..Sun in order", async () => {
    const initial: WeeklyPlanLoadResult = {
      status: "ok",
      plan: makePlan(),
      track_slug: "python-fundamentals",
    };
    await act(async () => {
      root.render(<WeeklyPlanCard initial={initial} />);
    });
    // Day labels are stored as Mon/Tue/Wed/.../Sun in the DOM; CSS text-transform: uppercase is
    // visual-only and doesn't change textContent.
    const text = container.textContent ?? "";
    expect(text).toContain("Mon");
    expect(text).toContain("Tue");
    expect(text).toContain("Wed");
    expect(text).toContain("Thu");
    expect(text).toContain("Fri");
    expect(text).toContain("Sat");
    expect(text).toContain("Sun");
  });

  it("renders a re-plan button", async () => {
    const initial: WeeklyPlanLoadResult = {
      status: "ok",
      plan: makePlan(),
      track_slug: "python-fundamentals",
    };
    await act(async () => {
      root.render(<WeeklyPlanCard initial={initial} />);
    });
    const button = container.querySelector('[data-testid="weekly-replan-button"]');
    expect(button).not.toBeNull();
    expect(button?.textContent).toBe("Re-plan week");
  });

  it("renders the due-reviews count line when > 0", async () => {
    const initial: WeeklyPlanLoadResult = {
      status: "ok",
      plan: makePlan({ due_reviews_count: 3 }),
      track_slug: "python-fundamentals",
    };
    await act(async () => {
      root.render(<WeeklyPlanCard initial={initial} />);
    });
    const due = container.querySelector('[data-testid="weekly-due-reviews"]');
    expect(due?.textContent).toContain("3 concepts");
  });

  it("does not render the due-reviews count line when 0", async () => {
    const initial: WeeklyPlanLoadResult = {
      status: "ok",
      plan: makePlan({ due_reviews_count: 0 }),
      track_slug: "python-fundamentals",
    };
    await act(async () => {
      root.render(<WeeklyPlanCard initial={initial} />);
    });
    expect(container.querySelector('[data-testid="weekly-due-reviews"]')).toBeNull();
  });

  it("renders the adaptive-adjustment banner when set", async () => {
    const initial: WeeklyPlanLoadResult = {
      status: "ok",
      plan: makePlan({
        dampening: {
          adaptive_adjustment_reason:
            "You missed a couple of weekdays — we trimmed this week's stretch to keep it doable.",
        },
      }),
      track_slug: "python-fundamentals",
    };
    await act(async () => {
      root.render(<WeeklyPlanCard initial={initial} />);
    });
    const banner = container.querySelector('[data-testid="weekly-adaptive-banner"]');
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain("missed a couple");
  });

  it("renders the reasoning panel listing all theme_concepts", async () => {
    const initial: WeeklyPlanLoadResult = {
      status: "ok",
      plan: makePlan(),
      track_slug: "python-fundamentals",
    };
    await act(async () => {
      root.render(<WeeklyPlanCard initial={initial} />);
    });
    const panel = container.querySelector('[data-testid="weekly-reasoning-panel"]');
    expect(panel).not.toBeNull();
    expect(panel?.textContent).toContain("python.basics.list-comprehensions");
    expect(panel?.textContent).toContain("python.basics.generators");
  });
});

describe("WeeklyPlanCard — unavailable / error states", () => {
  it("renders the unavailable panel when status='unavailable'", async () => {
    const initial: WeeklyPlanLoadResult = {
      status: "unavailable",
      message: "Weekly themes draw on the populated knowledge graph.",
    };
    await act(async () => {
      root.render(<WeeklyPlanCard initial={initial} />);
    });
    const panel = container.querySelector('[data-testid="weekly-plan-unavailable"]');
    expect(panel).not.toBeNull();
    expect(panel?.textContent).toContain("knowledge graph");
  });

  it("renders the error panel when status='error'", async () => {
    const initial: WeeklyPlanLoadResult = {
      status: "error",
      message: "We couldn't load the weekly plan right now.",
    };
    await act(async () => {
      root.render(<WeeklyPlanCard initial={initial} />);
    });
    const panel = container.querySelector('[data-testid="weekly-plan-error"]');
    expect(panel).not.toBeNull();
    expect(panel?.textContent).toContain("couldn't load");
  });

  it("does not render the day grid in error state", async () => {
    const initial: WeeklyPlanLoadResult = { status: "error", message: "boom" };
    await act(async () => {
      root.render(<WeeklyPlanCard initial={initial} />);
    });
    expect(container.querySelector('[data-testid="weekly-plan-day-grid"]')).toBeNull();
  });
});

describe("WeeklyPlanCard — re-plan button", () => {
  it("shows the dampened banner when the proxy returns dampened: true", async () => {
    const fetchImpl = mockFetch({
      body: {
        weekly_plan: makePlan(),
        dampened: true,
        reason: "Only one day missed — your weekly plan still applies.",
        track_slug: "python-fundamentals",
      },
    });
    const initial: WeeklyPlanLoadResult = {
      status: "ok",
      plan: makePlan(),
      track_slug: "python-fundamentals",
    };
    await act(async () => {
      root.render(<WeeklyPlanCard initial={initial} fetchImpl={fetchImpl} />);
    });
    const button = container.querySelector(
      '[data-testid="weekly-replan-button"]',
    ) as HTMLButtonElement;
    await act(async () => {
      button.click();
    });
    const banner = container.querySelector('[data-testid="weekly-replan-banner-dampened"]');
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain("Only one day missed");
  });

  it("shows the regenerated message when the planner produces a fresh plan", async () => {
    const freshPlan = makePlan({ theme: "Generators week" });
    const fetchImpl = mockFetch({
      body: {
        weekly_plan: freshPlan,
        dampened: false,
        track_slug: "python-fundamentals",
      },
    });
    const initial: WeeklyPlanLoadResult = {
      status: "ok",
      plan: makePlan(),
      track_slug: "python-fundamentals",
    };
    await act(async () => {
      root.render(<WeeklyPlanCard initial={initial} fetchImpl={fetchImpl} />);
    });
    const button = container.querySelector(
      '[data-testid="weekly-replan-button"]',
    ) as HTMLButtonElement;
    await act(async () => {
      button.click();
    });
    const banner = container.querySelector('[data-testid="weekly-replan-banner-regenerated"]');
    expect(banner).not.toBeNull();
    const themeEl = container.querySelector('[data-testid="weekly-plan-theme"]');
    expect(themeEl?.textContent).toBe("Generators week");
  });

  it("shows the error message when the proxy returns a non-OK status", async () => {
    const fetchImpl = mockFetch({ status: 503, body: { error: "weekly_plan_unavailable" } });
    const initial: WeeklyPlanLoadResult = {
      status: "ok",
      plan: makePlan(),
      track_slug: "python-fundamentals",
    };
    await act(async () => {
      root.render(<WeeklyPlanCard initial={initial} fetchImpl={fetchImpl} />);
    });
    const button = container.querySelector(
      '[data-testid="weekly-replan-button"]',
    ) as HTMLButtonElement;
    await act(async () => {
      button.click();
    });
    const banner = container.querySelector('[data-testid="weekly-replan-banner-error"]');
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain("briefly unavailable");
  });

  it("shows the error message when fetch throws", async () => {
    const fetchImpl = mockFetch({ throws: true });
    const initial: WeeklyPlanLoadResult = {
      status: "ok",
      plan: makePlan(),
      track_slug: "python-fundamentals",
    };
    await act(async () => {
      root.render(<WeeklyPlanCard initial={initial} fetchImpl={fetchImpl} />);
    });
    const button = container.querySelector(
      '[data-testid="weekly-replan-button"]',
    ) as HTMLButtonElement;
    await act(async () => {
      button.click();
    });
    const banner = container.querySelector('[data-testid="weekly-replan-banner-error"]');
    expect(banner).not.toBeNull();
  });
});

describe("WeeklyPlanCard — coach-voice copy / forbidden phrases", () => {
  it("never emits forbidden urgency / shame phrases on a populated plan", () => {
    const forbidden = ["DON'T LOSE", "DAY X", "BURN", "🔥", "⚠️", "fading"];
    const initial: WeeklyPlanLoadResult = {
      status: "ok",
      plan: makePlan({
        dampening: {
          adaptive_adjustment_reason:
            "You missed a couple of recent weekdays — we trimmed this week's stretch to keep it doable.",
        },
        due_reviews_count: 5,
      }),
      track_slug: "python-fundamentals",
    };
    const out = renderToStaticMarkup(<WeeklyPlanCard initial={initial} />);
    for (const phrase of forbidden) {
      expect(out).not.toContain(phrase);
    }
  });

  it("never emits forbidden phrases on the unavailable state copy", () => {
    const initial: WeeklyPlanLoadResult = { status: "unavailable" };
    const out = renderToStaticMarkup(<WeeklyPlanCard initial={initial} />);
    const forbidden = ["DON'T LOSE", "BURN", "🔥", "⚠️", "fading"];
    for (const phrase of forbidden) {
      expect(out).not.toContain(phrase);
    }
  });
});
