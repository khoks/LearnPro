/**
 * @vitest-environment jsdom
 */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RecommendedTracksCard, type RecommendedTrackSummary } from "./RecommendedTracksCard";

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
});

const PYTHON: RecommendedTrackSummary = {
  slug: "python-fundamentals",
  name: "Python fundamentals",
  language: "python",
  description: "Variables, loops, functions, lists.",
};

const TS: RecommendedTrackSummary = {
  slug: "typescript-fundamentals",
  name: "TypeScript fundamentals",
  language: "typescript",
  description: "Types, generics, modules.",
};

describe("<RecommendedTracksCard> — STORY-021", () => {
  it("renders the role label", () => {
    act(() => {
      root.render(
        <RecommendedTracksCard
          roleLabel="Backend engineer"
          bias="standard"
          recommendedDailyMinutes={45}
          tracks={[PYTHON]}
        />,
      );
    });
    const el = container.querySelector('[data-testid="recommended-role-label"]');
    expect(el?.textContent).toBe("Backend engineer");
  });

  it("renders one card per recommended track and links each to /session?track=<slug>", () => {
    act(() => {
      root.render(
        <RecommendedTracksCard
          roleLabel="Full-stack engineer"
          bias="standard"
          recommendedDailyMinutes={45}
          tracks={[PYTHON, TS]}
        />,
      );
    });
    const cards = container.querySelectorAll('[data-testid^="recommended-track-"]');
    expect(cards).toHaveLength(2);
    expect(cards[0]?.getAttribute("href")).toBe("/session?track=python-fundamentals");
    expect(cards[1]?.getAttribute("href")).toBe("/session?track=typescript-fundamentals");
  });

  it("preserves track order (TS first for full-stack)", () => {
    act(() => {
      root.render(
        <RecommendedTracksCard
          roleLabel="Full-stack engineer"
          bias="standard"
          recommendedDailyMinutes={45}
          tracks={[TS, PYTHON]}
        />,
      );
    });
    const cards = container.querySelectorAll('[data-testid^="recommended-track-"]');
    expect(cards[0]?.getAttribute("data-testid")).toBe("recommended-track-typescript-fundamentals");
    expect(cards[1]?.getAttribute("data-testid")).toBe("recommended-track-python-fundamentals");
  });

  it("renders the recommended daily minutes", () => {
    act(() => {
      root.render(
        <RecommendedTracksCard
          roleLabel="ML engineer"
          bias="math-heavy"
          recommendedDailyMinutes={60}
          tracks={[PYTHON]}
        />,
      );
    });
    expect(container.textContent).toContain("60 minutes a day");
  });

  it("always renders a 'Take me to the dashboard' link (free choice, no soft-locks)", () => {
    act(() => {
      root.render(
        <RecommendedTracksCard
          roleLabel="Backend engineer"
          bias="standard"
          recommendedDailyMinutes={45}
          tracks={[PYTHON]}
        />,
      );
    });
    const link = container.querySelector('[data-testid="dashboard-fallback-link"]');
    expect(link).not.toBeNull();
    expect(link?.getAttribute("href")).toBe("/dashboard");
    expect(link?.textContent).toContain("dashboard");
  });

  it("respects a custom dashboardHref override", () => {
    act(() => {
      root.render(
        <RecommendedTracksCard
          roleLabel="Backend engineer"
          bias="standard"
          recommendedDailyMinutes={45}
          tracks={[PYTHON]}
          dashboardHref="/custom"
        />,
      );
    });
    const link = container.querySelector('[data-testid="dashboard-fallback-link"]');
    expect(link?.getAttribute("href")).toBe("/custom");
  });

  it("renders the bias-specific hint for math-heavy", () => {
    act(() => {
      root.render(
        <RecommendedTracksCard
          roleLabel="ML engineer"
          bias="math-heavy"
          recommendedDailyMinutes={60}
          tracks={[PYTHON]}
        />,
      );
    });
    expect(container.textContent?.toLowerCase()).toContain("math-shaped");
  });

  it("renders the bias-specific hint for gentle-onramp", () => {
    act(() => {
      root.render(
        <RecommendedTracksCard
          roleLabel="Career switcher (from data analyst)"
          bias="gentle-onramp"
          recommendedDailyMinutes={30}
          tracks={[PYTHON]}
        />,
      );
    });
    expect(container.textContent?.toLowerCase()).toContain("habit");
  });
});

// Anti-dark-pattern coach voice — same forbidden-phrase shape used by the dashboard tests
// (dashboard-components.test.tsx). Each render of every bias/copy combination must avoid urgency,
// shame, and gating language.
describe("<RecommendedTracksCard> — coach-voice copy (forbidden-phrase guard)", () => {
  const FORBIDDEN: ReadonlyArray<RegExp> = [
    /\bmust\b/i,
    /\bhave to\b/i,
    /\bcan't\b/i,
    /\bdon't lose\b/i,
    /\brequired\b/i,
    /🔥/,
    /⚠️/,
    /\bpenalty\b/i,
  ];

  for (const bias of ["standard", "math-heavy", "gentle-onramp"] as const) {
    it(`bias=${bias} copy avoids forbidden phrases`, () => {
      act(() => {
        root.render(
          <RecommendedTracksCard
            roleLabel="Backend engineer"
            bias={bias}
            recommendedDailyMinutes={45}
            tracks={[PYTHON, TS]}
          />,
        );
      });
      const text = container.textContent ?? "";
      for (const re of FORBIDDEN) {
        expect(text, `forbidden phrase ${re} matched copy: ${text}`).not.toMatch(re);
      }
    });
  }
});
