/**
 * @vitest-environment jsdom
 */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardCardsRow } from "./DashboardCardsRow";

void React;

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Minimal matchMedia harness — same shape as use-viewport-size.test.tsx but trimmed for the
// DOM-assertion shape we want here.
function installViewport(width: number, height = 800) {
  Object.defineProperty(window, "innerWidth", { configurable: true, get: () => width });
  Object.defineProperty(window, "innerHeight", { configurable: true, get: () => height });
  window.matchMedia = vi.fn((query: string) => {
    const max = query.match(/max-width:\s*(\d+)px/);
    const min = query.match(/min-width:\s*(\d+)px/);
    let matches = true;
    if (max && width > Number(max[1])) matches = false;
    if (min && width < Number(min[1])) matches = false;
    return {
      matches,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => true,
    } as unknown as MediaQueryList;
  });
}

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

const PROPS = {
  xp: 100,
  streakDays: 3,
  graceDaysRemaining: 2,
  graceDaysUsedThisCheck: 0,
  monthlyGraceCap: 2,
};

function findRow(): HTMLElement {
  const el = container.querySelector('[data-testid="dashboard-cards-row"]');
  if (!el) throw new Error("dashboard-cards-row not found");
  return el as HTMLElement;
}

describe("DashboardCardsRow — STORY-025 responsive grid", () => {
  it("uses a single column at <768 (mobile)", () => {
    installViewport(375);
    act(() => {
      root.render(<DashboardCardsRow {...PROPS} />);
    });
    const row = findRow();
    expect(row.style.gridTemplateColumns).toBe("1fr");
    expect(row.dataset.breakpoint).toBe("mobile");
  });

  it("uses a 2-column layout at 768 (tablet)", () => {
    installViewport(768);
    act(() => {
      root.render(<DashboardCardsRow {...PROPS} />);
    });
    const row = findRow();
    expect(row.style.gridTemplateColumns).toBe("1fr 1fr");
    expect(row.dataset.breakpoint).toBe("tablet");
  });

  it("uses a 2-column layout at 1366 (laptop)", () => {
    installViewport(1366);
    act(() => {
      root.render(<DashboardCardsRow {...PROPS} />);
    });
    const row = findRow();
    expect(row.style.gridTemplateColumns).toBe("1fr 1fr");
    expect(row.dataset.breakpoint).toBe("laptop");
  });

  it("renders both cards regardless of breakpoint", () => {
    installViewport(375);
    act(() => {
      root.render(<DashboardCardsRow {...PROPS} />);
    });
    expect(container.querySelector('[data-testid="xp-card"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="streak-card"]')).not.toBeNull();
  });
});
