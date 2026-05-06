/**
 * @vitest-environment jsdom
 */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlaygroundClient } from "./PlaygroundClient";

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

function findControls(): HTMLElement {
  const el = container.querySelector('[data-testid="playground-controls"]');
  if (!el) throw new Error("playground-controls not found");
  return el as HTMLElement;
}

describe("PlaygroundClient — STORY-025 responsive controls row", () => {
  it("stacks the controls row vertically below 768", () => {
    installViewport(375);
    act(() => {
      root.render(<PlaygroundClient />);
    });
    const row = findControls();
    expect(row.style.flexDirection).toBe("column");
    expect(row.dataset.breakpoint).toBe("mobile");
  });

  it("lays the controls row out as a row at 1024+", () => {
    installViewport(1366);
    act(() => {
      root.render(<PlaygroundClient />);
    });
    const row = findControls();
    expect(row.style.flexDirection).toBe("row");
    expect(row.dataset.breakpoint).toBe("laptop");
  });
});

describe("PlaygroundClient — STORY-059 streaming toggle", () => {
  it("renders the stream-output toggle defaulting to off", () => {
    installViewport(1366);
    act(() => {
      root.render(<PlaygroundClient />);
    });
    const toggle = container.querySelector(
      '[data-testid="stream-output-toggle"]',
    ) as HTMLInputElement;
    expect(toggle).toBeTruthy();
    expect(toggle.checked).toBe(false);
  });

  it("toggling stream-output flips the checkbox state", () => {
    installViewport(1366);
    act(() => {
      root.render(<PlaygroundClient />);
    });
    const toggle = container.querySelector(
      '[data-testid="stream-output-toggle"]',
    ) as HTMLInputElement;
    act(() => {
      toggle.click();
    });
    expect(toggle.checked).toBe(true);
  });
});
