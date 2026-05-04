/**
 * @vitest-environment jsdom
 */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionClient } from "./SessionClient";

void React;

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// SessionClient kicks off async fetches on mount (`/api/session-plan` GET / POST and the
// tutor-assign call). We stub `fetch` so jsdom doesn't try to make real network calls.
// The session-plan stub returns "no plan yet"; the tutor-assign stub returns a 503 so the
// session reducer transitions to `error` and the SessionView renders the error banner —
// neither path matters for the layout tests, which only inspect the wrapping grid.
function installFetchStub() {
  global.fetch = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/session-plan")) {
      return new Response(JSON.stringify({ plan: null, fallback: false }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    // Default: 503 so the tutor-assign driver returns an `assign_failed` event rather than
    // an unhandled-rejection (which would otherwise leak when SessionClient unmounts mid-
    // assign).
    return new Response(JSON.stringify({ error: { code: "stub" } }), { status: 503 });
  }) as typeof fetch;
}

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
  installFetchStub();
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

function findLayout(): HTMLElement {
  const el = container.querySelector('[data-testid="session-layout"]');
  if (!el) throw new Error("session-layout not found");
  return el as HTMLElement;
}

describe("SessionClient SessionLayout — STORY-025 responsive shell", () => {
  it("uses the 2-column grid + always-visible sidebar at 1366 (laptop)", () => {
    installViewport(1366);
    act(() => {
      root.render(<SessionClient trackId="python-fundamentals" />);
    });
    const layout = findLayout();
    expect(layout.dataset.breakpoint).toBe("laptop");
    expect(layout.style.gridTemplateColumns).toBe("minmax(0, 1fr) 280px");
    // No "Show plan" toggle at laptop width.
    expect(container.querySelector('[data-testid="session-plan-toggle"]')).toBeNull();
    // Sidebar is rendered (its `aside` has aria-label "Session plan").
    expect(container.querySelector('aside[aria-label="Session plan"]')).not.toBeNull();
  });

  it("collapses to single-column + shows the 'Show plan' toggle at 1023 (tablet)", () => {
    installViewport(1023);
    act(() => {
      root.render(<SessionClient trackId="python-fundamentals" />);
    });
    const layout = findLayout();
    expect(layout.dataset.breakpoint).toBe("tablet");
    expect(layout.style.gridTemplateColumns).toBe("minmax(0, 1fr)");
    const toggle = container.querySelector(
      '[data-testid="session-plan-toggle"]',
    ) as HTMLButtonElement | null;
    expect(toggle).not.toBeNull();
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    // Drawer is closed: sidebar is not rendered.
    expect(container.querySelector('[data-testid="session-plan-drawer"]')).toBeNull();
  });

  it("opens the drawer when the 'Show plan' button is clicked at <1024", () => {
    installViewport(900);
    act(() => {
      root.render(<SessionClient trackId="python-fundamentals" />);
    });
    const toggle = container.querySelector(
      '[data-testid="session-plan-toggle"]',
    ) as HTMLButtonElement | null;
    expect(toggle).not.toBeNull();
    if (!toggle) throw new Error("toggle missing");

    act(() => {
      toggle.click();
    });

    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector('[data-testid="session-plan-drawer"]')).not.toBeNull();
    expect(toggle.textContent).toBe("Hide plan");
  });

  it("uses single-column at 768 (mobile)", () => {
    installViewport(768);
    act(() => {
      root.render(<SessionClient trackId="python-fundamentals" />);
    });
    const layout = findLayout();
    expect(layout.dataset.breakpoint).toBe("tablet"); // 768 = tablet band start
    expect(layout.style.gridTemplateColumns).toBe("minmax(0, 1fr)");
  });

  it("uses single-column at 375 (mobile)", () => {
    installViewport(375);
    act(() => {
      root.render(<SessionClient trackId="python-fundamentals" />);
    });
    const layout = findLayout();
    expect(layout.dataset.breakpoint).toBe("mobile");
    expect(layout.style.gridTemplateColumns).toBe("minmax(0, 1fr)");
  });
});
