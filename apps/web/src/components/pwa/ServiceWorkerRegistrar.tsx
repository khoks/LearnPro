"use client";

import * as React from "react";
import { useEffect } from "react";

void React;

// STORY-044 — registers `/sw.js` on mount. Same pattern STORY-023 used for the bell-icon flow,
// but lifted into a top-level component so the SW registers on every page (not just dashboard /
// session). Idempotent — calling register() with the same path is a no-op if a controller is
// already active.
//
// Production-only by default; dev/HMR doesn't ship a real SW (Next.js's dev mode invalidates the
// shell precache rapidly and the cache-first strategy gets in the way of `pnpm dev` reloads). The
// user can override with `NEXT_PUBLIC_LEARNPRO_ENABLE_SW=1` if they want to test SW behaviour
// against the dev server.

export function ServiceWorkerRegistrar(): null {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    const isProd = process.env.NODE_ENV === "production";
    const overrideOn = process.env["NEXT_PUBLIC_LEARNPRO_ENABLE_SW"] === "1";
    if (!isProd && !overrideOn) return;

    // Wait for the page to finish loading so SW install doesn't compete with the first paint.
    const onLoad = (): void => {
      navigator.serviceWorker.register("/sw.js").catch((err: unknown) => {
        // Swallow registration failures — SW is a progressive enhancement, never block the page.
        // eslint-disable-next-line no-console
        console.warn("[learnpro] service worker registration failed", err);
      });
    };

    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad, { once: true });

    return () => {
      window.removeEventListener("load", onLoad);
    };
  }, []);

  return null;
}
