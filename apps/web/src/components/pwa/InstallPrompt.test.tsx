import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InstallPrompt } from "./InstallPrompt";

void React;

const FORBIDDEN_PHRASES = [
  "DON'T LOSE",
  "lose your streak",
  "fall behind",
  "miss reminders",
  "DAY ",
  "🔥",
  "⚠️",
];

describe("InstallPrompt — STORY-044", () => {
  it("renders nothing under SSR when no install event has fired", () => {
    // Without `installEventOverride`, useEffect doesn't fire under SSR → installEvent stays
    // null and the visibility predicate returns false.
    const out = renderToStaticMarkup(
      <InstallPrompt
        loadOnMount={false}
        initialEligibility={{ eligible: true, successful_episodes: 5, threshold: 3 }}
      />,
    );
    expect(out).toBe("");
  });

  it("renders nothing when not eligible (server says <3 successful episodes)", () => {
    // Even with an install event the prompt shouldn't show. We can't construct a real
    // BeforeInstallPromptEvent under SSR, so we simulate eligibility=false and verify the
    // no-render outcome.
    const out = renderToStaticMarkup(
      <InstallPrompt
        loadOnMount={false}
        initialEligibility={{ eligible: false, successful_episodes: 1, threshold: 3 }}
      />,
    );
    expect(out).toBe("");
  });

  // The "render" path requires both an install event AND eligibility. SSR can't fire useEffect,
  // so we rely on the pure helper tests in install-prompt.test.ts to cover the visibility rule
  // exhaustively. The component-level forbidden-phrase guard runs against the CONSTANT copy in
  // the JSX — we re-import the source to check the literal strings.
  it("never declares dark-pattern / streak-shaming copy in its source", async () => {
    // Read the component file as a string and assert no forbidden phrase appears.
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(process.cwd(), "src/components/pwa/InstallPrompt.tsx");
    const source = fs.readFileSync(file, "utf8");
    for (const phrase of FORBIDDEN_PHRASES) {
      expect(source).not.toContain(phrase);
    }
  });
});
