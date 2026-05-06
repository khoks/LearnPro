import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import OfflinePage from "./page";

void React;

// STORY-044 — coach-voice copy guard for the offline page. Same forbidden-phrase pattern as
// STORY-022 / STORY-023 / STORY-024 / STORY-054.

const FORBIDDEN_PHRASES = [
  "DON'T LOSE",
  "lose your streak",
  "fall behind",
  "miss reminders",
  "DAY ",
  "🔥",
  "⚠️",
];

describe("OfflinePage — STORY-044 PWA baseline", () => {
  it("renders the offline message", () => {
    const out = renderToStaticMarkup(<OfflinePage />);
    expect(out).toContain("You&#x27;re offline");
    expect(out).toContain("Reconnect to continue practicing");
  });

  it("explains the editor needs internet (so the offline-banner copy stays consistent)", () => {
    const out = renderToStaticMarkup(<OfflinePage />);
    expect(out).toContain("editor needs an internet connection");
  });

  it("lists at least one cached page the user can still visit", () => {
    const out = renderToStaticMarkup(<OfflinePage />);
    expect(out).toContain("/dashboard");
  });

  it("never uses dark-pattern / streak-shaming copy", () => {
    const out = renderToStaticMarkup(<OfflinePage />);
    for (const phrase of FORBIDDEN_PHRASES) {
      expect(out).not.toContain(phrase);
    }
  });

  it("uses #main-content as the landing target so the global skip-link works", () => {
    const out = renderToStaticMarkup(<OfflinePage />);
    expect(out).toContain('id="main-content"');
  });
});
