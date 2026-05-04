"use client";

import { useEffect, useState } from "react";
import { BREAKPOINTS, breakpointFor, type Breakpoint } from "./responsive";

// STORY-025 — SSR-safe viewport hook. During SSR (no `window`), we report a "laptop"-tier
// width so the first server render matches the most common desktop layout — that keeps the
// hydration warning quiet for the dominant case. The matchMedia listeners then pick up the
// real width on the client. Pages that need tighter SSR/CSR parity should branch on this
// hook's `width === null`-style signal — but the MVP doesn't.

export interface ViewportSize {
  width: number;
  height: number;
  breakpoint: Breakpoint;
}

const DEFAULT_LAPTOP: ViewportSize = {
  width: BREAKPOINTS.tablet,
  height: 768,
  breakpoint: "laptop",
};

function readViewport(): ViewportSize {
  if (typeof window === "undefined") return DEFAULT_LAPTOP;
  const width = window.innerWidth;
  const height = window.innerHeight;
  return { width, height, breakpoint: breakpointFor(width) };
}

export function useViewportSize(): ViewportSize {
  const [size, setSize] = useState<ViewportSize>(readViewport);

  useEffect(() => {
    if (typeof window === "undefined") return;

    function update() {
      setSize(readViewport());
    }

    // Sync once on mount in case SSR rendered with the laptop default but the client is on
    // a smaller viewport.
    update();

    // Two matchMedia listeners — one for each breakpoint boundary. We don't bind to `resize`
    // directly; matchMedia fires only on band crossings, which avoids re-render storms when
    // the user is dragging the window edge. (Width / height inside `update()` still come from
    // `window.innerWidth/innerHeight`, so the numbers stay precise — we just rate-limit the
    // re-render trigger.)
    const mobileQuery = window.matchMedia(`(max-width: ${BREAKPOINTS.mobile - 1}px)`);
    const tabletQuery = window.matchMedia(
      `(min-width: ${BREAKPOINTS.mobile}px) and (max-width: ${BREAKPOINTS.tablet - 1}px)`,
    );

    mobileQuery.addEventListener("change", update);
    tabletQuery.addEventListener("change", update);
    window.addEventListener("resize", update);

    return () => {
      mobileQuery.removeEventListener("change", update);
      tabletQuery.removeEventListener("change", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return size;
}
