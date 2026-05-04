/**
 * @vitest-environment jsdom
 */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardHeader } from "./DashboardHeader";

void React;

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function installViewport(width: number, height = 800) {
  Object.defineProperty(window, "innerWidth", { configurable: true, get: () => width });
  Object.defineProperty(window, "innerHeight", { configurable: true, get: () => height });
  window.matchMedia = vi.fn(
    (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => true,
      }) as unknown as MediaQueryList,
  );
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

function findHeader(): HTMLElement {
  const el = container.querySelector('[data-testid="dashboard-header"]');
  if (!el) throw new Error("dashboard-header not found");
  return el as HTMLElement;
}

describe("DashboardHeader — STORY-025 responsive header", () => {
  it("stacks vertically below 768", () => {
    installViewport(375);
    act(() => {
      root.render(<DashboardHeader email="you@example.com" sessionHref="/session" />);
    });
    const header = findHeader();
    expect(header.style.flexDirection).toBe("column");
    expect(header.dataset.breakpoint).toBe("mobile");
  });

  it("lays out side-by-side at 768+", () => {
    installViewport(900);
    act(() => {
      root.render(<DashboardHeader email="you@example.com" sessionHref="/session" />);
    });
    const header = findHeader();
    expect(header.style.flexDirection).toBe("row");
    expect(header.dataset.breakpoint).toBe("tablet");
  });

  it("renders the bell on every breakpoint", () => {
    installViewport(375);
    act(() => {
      root.render(<DashboardHeader email="you@example.com" sessionHref="/session" />);
    });
    expect(container.querySelector('[data-testid="notification-bell-button"]')).not.toBeNull();
  });
});
