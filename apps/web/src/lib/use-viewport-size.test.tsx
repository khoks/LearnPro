/**
 * @vitest-environment jsdom
 */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useViewportSize } from "./use-viewport-size";

void React;

// React 19 looks at this global to decide whether to suppress the "act() outside an act
// boundary" noise. Vitest's jsdom env doesn't set it; flip it on for this file only.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// matchMedia listeners — keyed by query string so a test can fire a band-cross event.
type Listener = (e: MediaQueryListEvent) => void;
// Mutable stand-in for the lib.dom MediaQueryList — we need to flip `matches` from inside
// the harness to simulate band crossings, which the lib.dom interface marks readonly. Local
// fake type, not exported.
interface FakeQuery {
  query: string;
  matches: boolean;
  media: string;
  onchange: ((this: MediaQueryList, ev: MediaQueryListEvent) => unknown) | null;
  addListener: (cb: (this: MediaQueryList, ev: MediaQueryListEvent) => unknown) => void;
  removeListener: (cb: (this: MediaQueryList, ev: MediaQueryListEvent) => unknown) => void;
  addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => void;
  removeEventListener: (type: string, listener: EventListenerOrEventListenerObject) => void;
  dispatchEvent: (event: Event) => boolean;
  listeners: Set<Listener>;
}

interface Harness {
  width: number;
  height: number;
  queries: Map<string, FakeQuery>;
  setWidth(next: number): void;
}

function installMatchMedia(initialWidth: number, initialHeight: number): Harness {
  const queries = new Map<string, FakeQuery>();
  const harness: Harness = {
    width: initialWidth,
    height: initialHeight,
    queries,
    setWidth(next: number) {
      harness.width = next;
      // Update each query's `matches` flag and fire the change event for queries whose
      // truthiness flipped.
      for (const q of queries.values()) {
        const wasMatching = q.matches;
        q.matches = matchesQuery(q.query, next);
        if (q.matches !== wasMatching) {
          for (const l of q.listeners) {
            l(new Event("change") as unknown as MediaQueryListEvent);
          }
        }
      }
    },
  };

  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    get: () => harness.width,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    get: () => harness.height,
  });

  // Cast through `unknown` because our FakeQuery has mutable `matches`, which lib.dom marks
  // readonly. The shape is otherwise structurally compatible with MediaQueryList.
  window.matchMedia = vi.fn((query: string): MediaQueryList => {
    const existing = queries.get(query);
    if (existing) return existing as unknown as MediaQueryList;
    const listeners = new Set<Listener>();
    const fake: FakeQuery = {
      query,
      matches: matchesQuery(query, harness.width),
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
        if (type === "change" && typeof listener === "function")
          listeners.add(listener as Listener);
      },
      removeEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
        if (type === "change" && typeof listener === "function")
          listeners.delete(listener as Listener);
      },
      dispatchEvent: () => true,
      listeners,
    };
    queries.set(query, fake);
    return fake as unknown as MediaQueryList;
  });

  return harness;
}

// Small subset of the CSS media-query grammar — enough to evaluate
// `(max-width: 767px)` and `(min-width: 768px) and (max-width: 1023px)`.
function matchesQuery(query: string, width: number): boolean {
  const clauses = query.split(" and ").map((s) => s.trim().replace(/^\(|\)$/g, ""));
  for (const c of clauses) {
    const max = c.match(/^max-width:\s*(\d+)px$/);
    const min = c.match(/^min-width:\s*(\d+)px$/);
    if (max) {
      if (width > Number(max[1])) return false;
    } else if (min) {
      if (width < Number(min[1])) return false;
    } else {
      return false;
    }
  }
  return true;
}

let container: HTMLDivElement;
let root: Root;

function HookProbe({ onSize }: { onSize: (s: ReturnType<typeof useViewportSize>) => void }) {
  const size = useViewportSize();
  onSize(size);
  return null;
}

function render(onSize: (s: ReturnType<typeof useViewportSize>) => void) {
  act(() => {
    root.render(<HookProbe onSize={onSize} />);
  });
}

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

describe("useViewportSize", () => {
  it("reports laptop at 1366×768", () => {
    installMatchMedia(1366, 768);
    let last: ReturnType<typeof useViewportSize> | undefined;
    render((s) => {
      last = s;
    });
    expect(last).toEqual({ width: 1366, height: 768, breakpoint: "laptop" });
  });

  it("reports tablet at 900×800", () => {
    installMatchMedia(900, 800);
    let last: ReturnType<typeof useViewportSize> | undefined;
    render((s) => {
      last = s;
    });
    expect(last?.breakpoint).toBe("tablet");
    expect(last?.width).toBe(900);
  });

  it("reports mobile at 375×667", () => {
    installMatchMedia(375, 667);
    let last: ReturnType<typeof useViewportSize> | undefined;
    render((s) => {
      last = s;
    });
    expect(last?.breakpoint).toBe("mobile");
    expect(last?.width).toBe(375);
  });

  it("re-renders when crossing a band boundary via matchMedia change", () => {
    const harness = installMatchMedia(1366, 768);
    const reads: ReturnType<typeof useViewportSize>[] = [];
    render((s) => {
      reads.push(s);
    });
    // The hook reports a single "laptop" reading on mount.
    expect(reads.at(-1)?.breakpoint).toBe("laptop");

    act(() => {
      harness.setWidth(900);
    });

    expect(reads.at(-1)?.breakpoint).toBe("tablet");
    expect(reads.at(-1)?.width).toBe(900);
  });

  it("removes its listeners on unmount", () => {
    const harness = installMatchMedia(1366, 768);
    let last: ReturnType<typeof useViewportSize> | undefined;
    render((s) => {
      last = s;
    });
    expect(last?.breakpoint).toBe("laptop");

    act(() => {
      root.unmount();
    });

    // After unmount, every previously-registered listener should be gone.
    for (const q of harness.queries.values()) {
      expect(q.listeners.size).toBe(0);
    }
  });
});
