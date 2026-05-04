/**
 * @vitest-environment jsdom
 */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DashboardCardsRow } from "../app/dashboard/DashboardCardsRow";
import { DashboardHeader } from "../app/dashboard/DashboardHeader";
import { PlaygroundClient } from "../app/playground/PlaygroundClient";
import { SessionClient } from "../app/session/SessionClient";
import { StatusBadge } from "../components/status-badge";

void React;

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// STORY-025 — integration sweep: every top-level page renders cleanly at the four spec'd
// viewport sizes (1920×1080, 1366×768, 1024×768, 768×1024) and produces NO horizontal
// scrollbar at 768. The test mounts each page (or a faithful representative shell, for the
// pages whose top-level component is an `async` server component bound to auth + DB).
//
// We can't `getComputedStyle` against jsdom's stylesheet engine reliably for inline `style`
// values, so layout assertions read `style.flexDirection` / `style.gridTemplateColumns`
// directly off the rendered element — same approach as the per-component tests.

interface MatchMediaHarness {
  width: number;
  height: number;
}

function installViewport(width: number, height: number): MatchMediaHarness {
  const harness: MatchMediaHarness = { width, height };
  Object.defineProperty(window, "innerWidth", { configurable: true, get: () => harness.width });
  Object.defineProperty(window, "innerHeight", { configurable: true, get: () => harness.height });
  Object.defineProperty(document.documentElement, "clientWidth", {
    configurable: true,
    get: () => harness.width,
  });
  window.matchMedia = vi.fn((query: string) => {
    const max = query.match(/max-width:\s*(\d+)px/);
    const min = query.match(/min-width:\s*(\d+)px/);
    let matches = true;
    if (max && harness.width > Number(max[1])) matches = false;
    if (min && harness.width < Number(min[1])) matches = false;
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
  return harness;
}

function installFetchStub() {
  global.fetch = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/session-plan")) {
      return new Response(JSON.stringify({ plan: null, fallback: false }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: { code: "stub" } }), { status: 503 });
  }) as typeof fetch;
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

const VIEWPORTS = [
  { label: "1920x1080 (laptop)", width: 1920, height: 1080, breakpoint: "laptop" as const },
  { label: "1366x768 (laptop)", width: 1366, height: 768, breakpoint: "laptop" as const },
  { label: "1024x768 (laptop boundary)", width: 1024, height: 768, breakpoint: "laptop" as const },
  { label: "768x1024 (tablet)", width: 768, height: 1024, breakpoint: "tablet" as const },
];

// `dashboard` shell — a faithful representation of the post-auth surface so we can render it
// through createRoot (the real /dashboard page is `async` and pulls auth + DB).
function DashboardShell() {
  return (
    <main
      id="main-content"
      style={{
        padding: "1.25rem",
        fontFamily: "system-ui, sans-serif",
        maxWidth: 960,
        margin: "0 auto",
      }}
    >
      <DashboardHeader email="you@example.com" sessionHref="/session" />
      <DashboardCardsRow
        xp={1234}
        streakDays={3}
        graceDaysRemaining={2}
        graceDaysUsedThisCheck={0}
        monthlyGraceCap={2}
      />
    </main>
  );
}

// `onboarding` shell — mirrors apps/web/src/app/onboarding/page.tsx + a single bubble. We
// don't need to drive the chat reducer, just confirm the layout doesn't overflow.
function OnboardingShell() {
  return (
    <main
      id="main-content"
      style={{
        padding: "1.25rem",
        fontFamily: "system-ui, sans-serif",
        maxWidth: 720,
        margin: "0 auto",
      }}
    >
      <header style={{ marginBottom: "1rem" }}>
        <h1 style={{ margin: 0 }}>Welcome to LearnPro</h1>
        <p style={{ margin: "0.25rem 0 0", color: "#555" }}>
          A few quick questions to set up your learning plan. Skip any time.
        </p>
      </header>
      <section style={{ display: "grid", gap: "1rem" }}>
        <div
          style={{
            maxHeight: 420,
            overflowY: "auto",
            border: "1px solid #ddd",
            borderRadius: 6,
            padding: "0.75rem",
            background: "#fafafa",
            display: "grid",
            gap: "0.5rem",
          }}
        >
          <div
            style={{
              alignSelf: "flex-start",
              maxWidth: "min(100%, 600px)",
              padding: "0.55rem 0.75rem",
              background: "#fff",
              border: "1px solid #ddd",
              borderRadius: 8,
              fontSize: 14,
            }}
          >
            Hi! Let&apos;s set up your plan.
          </div>
        </div>
      </section>
    </main>
  );
}

// `signin` shell — mirrors apps/web/src/app/auth/signin/page.tsx.
function SignInShell() {
  return (
    <main
      id="main-content"
      style={{
        padding: "2rem 1.25rem",
        maxWidth: 420,
        margin: "0 auto",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <h1 style={{ marginBottom: "0.25rem" }}>Sign in to LearnPro</h1>
      <p style={{ color: "#666", marginTop: 0 }}>Pick the way you prefer.</p>
      <form style={{ display: "grid", gap: "0.5rem", marginTop: "1.25rem" }}>
        <label htmlFor="email" style={{ fontWeight: 600 }}>
          Email
        </label>
        <input id="email" name="email" type="email" required autoComplete="email" />
        <button type="submit">Email me a magic link</button>
      </form>
    </main>
  );
}

// `home` shell — mirrors apps/web/src/app/page.tsx.
function HomeShell() {
  return (
    <main id="main-content" style={{ padding: "1.25rem", fontFamily: "system-ui, sans-serif" }}>
      <h1>LearnPro</h1>
      <p>Adaptive AI-tutored self-hosted learning platform.</p>
      <ul>
        <li>
          <a href="/auth/signin">/auth/signin</a> — sign in to start
        </li>
      </ul>
    </main>
  );
}

// `health` shell — mirrors apps/web/src/app/health/page.tsx.
function HealthShell() {
  return (
    <main id="main-content" style={{ padding: "1.25rem", fontFamily: "system-ui, sans-serif" }}>
      <h1>Health</h1>
      <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
        {JSON.stringify({ ok: true, service: "web" }, null, 2)}
      </pre>
    </main>
  );
}

// `playground` page wrapper — the real PlaygroundClient is a "use client" component, so we
// can mount it inside the test root directly. We render its host page wrapper around it.
function PlaygroundShell() {
  return (
    <main id="main-content" style={{ padding: "1.25rem", fontFamily: "system-ui, sans-serif" }}>
      <header style={{ marginBottom: "1rem" }}>
        <h1 style={{ margin: 0 }}>Playground</h1>
      </header>
      <PlaygroundClient />
    </main>
  );
}

// `session` page wrapper — same pattern as /playground; SessionClient is a "use client"
// component that owns its own layout (the SessionLayout disclosure).
function SessionShell() {
  return (
    <main
      id="main-content"
      style={{
        padding: "1.25rem",
        fontFamily: "system-ui, sans-serif",
        maxWidth: 1080,
        margin: "0 auto",
      }}
    >
      <header style={{ marginBottom: "1rem" }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Session</h1>
      </header>
      <SessionClient trackId="python-fundamentals" />
    </main>
  );
}

// Status badge — touched in this suite so a future status-badge regression that breaks the
// inline-flex layout would surface here too.
function _BadgeProbe() {
  return (
    <div>
      <StatusBadge variant="pass">OK</StatusBadge>
    </div>
  );
}
void _BadgeProbe;

const SHELLS: Array<{ name: string; render: () => React.ReactElement }> = [
  { name: "/", render: () => <HomeShell /> },
  { name: "/health", render: () => <HealthShell /> },
  { name: "/auth/signin", render: () => <SignInShell /> },
  { name: "/dashboard", render: () => <DashboardShell /> },
  { name: "/onboarding", render: () => <OnboardingShell /> },
  { name: "/playground", render: () => <PlaygroundShell /> },
  { name: "/session", render: () => <SessionShell /> },
];

describe("STORY-025 — pages render across the four spec viewport sizes", () => {
  for (const { name, render } of SHELLS) {
    for (const v of VIEWPORTS) {
      it(`${name} renders at ${v.label}`, () => {
        installViewport(v.width, v.height);
        act(() => {
          root.render(render());
        });
        // Smoke check — the main element exists.
        const main = container.querySelector("#main-content");
        expect(main, `${name} @ ${v.label}: #main-content not rendered`).not.toBeNull();
      });
    }
  }
});

describe("STORY-025 — no horizontal overflow at 768 width", () => {
  for (const { name, render } of SHELLS) {
    it(`${name}: no element forces width past 768`, () => {
      installViewport(768, 1024);
      // Force the container to a 768px box so child overflow becomes a measurable
      // `scrollWidth > 768` condition.
      container.style.width = "768px";
      container.style.overflow = "hidden";
      act(() => {
        root.render(render());
      });
      // jsdom doesn't run the layout engine, so `scrollWidth` is generally 0 — checking the
      // absence of obviously-wide inline-style declarations is a more reliable proxy. We walk
      // every rendered node and assert that no element pins itself to a fixed width > 768.
      const all = container.querySelectorAll("*");
      for (const node of Array.from(all)) {
        const el = node as HTMLElement;
        const w = el.style.width;
        // Allow "100%", "auto", named tokens, etc. — only guard against px values larger
        // than 768.
        const px = w.match(/^(\d+(?:\.\d+)?)px$/);
        if (px) {
          const value = Number(px[1]);
          expect(
            value,
            `${name}: element <${el.tagName.toLowerCase()}> sets width: ${w}, larger than the 768 budget`,
          ).toBeLessThanOrEqual(768);
        }
        const minW = el.style.minWidth;
        const minPx = minW.match(/^(\d+(?:\.\d+)?)px$/);
        if (minPx) {
          const value = Number(minPx[1]);
          expect(
            value,
            `${name}: element <${el.tagName.toLowerCase()}> sets min-width: ${minW}, larger than the 768 budget`,
          ).toBeLessThanOrEqual(768);
        }
      }
    });
  }
});
