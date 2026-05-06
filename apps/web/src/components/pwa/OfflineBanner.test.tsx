import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OfflineBanner } from "./OfflineBanner";

void React;

// STORY-044 — coach-voice copy guard for the offline banner. Same forbidden-phrase pattern as
// the offline page, autonomy indicator, streak card, etc.
const FORBIDDEN_PHRASES = [
  "DON'T LOSE",
  "lose your streak",
  "fall behind",
  "miss reminders",
  "DAY ",
  "🔥",
  "⚠️",
  "remedial",
];

describe("OfflineBanner — STORY-044", () => {
  it("renders nothing when not forced offline (online state)", () => {
    const out = renderToStaticMarkup(<OfflineBanner />);
    // SSR-only: useEffect doesn't fire, browserOffline stays false → banner doesn't render.
    expect(out).toBe("");
  });

  it("renders the banner when forceOffline is true", () => {
    const out = renderToStaticMarkup(<OfflineBanner forceOffline={true} />);
    expect(out).toContain('data-testid="offline-banner"');
    expect(out).toContain("You&#x27;re offline");
    expect(out).toContain("editor needs an internet connection");
  });

  it("explains what still works (hints, history, dashboard)", () => {
    const out = renderToStaticMarkup(<OfflineBanner forceOffline={true} />);
    expect(out).toContain("Hints");
    expect(out).toContain("history");
    expect(out).toContain("dashboard");
  });

  it("uses role=status + aria-live=polite for screen-reader announcement", () => {
    const out = renderToStaticMarkup(<OfflineBanner forceOffline={true} />);
    expect(out).toContain('role="status"');
    expect(out).toContain('aria-live="polite"');
  });

  it("never uses dark-pattern / streak-shaming copy", () => {
    const out = renderToStaticMarkup(<OfflineBanner forceOffline={true} />);
    for (const phrase of FORBIDDEN_PHRASES) {
      expect(out).not.toContain(phrase);
    }
  });
});
