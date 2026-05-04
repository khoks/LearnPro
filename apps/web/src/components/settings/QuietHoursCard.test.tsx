import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { QuietHoursCard } from "./QuietHoursCard.js";

void React;

// Anti-dark-pattern guard. Mirrors STORY-022 / STORY-023 forbidden-phrase tests.
const FORBIDDEN_PHRASES = [
  "DON'T LOSE",
  "DAY X",
  "burn",
  "BURN",
  "🔥",
  "⚠️",
  "miss",
  "lose your streak",
  "fall behind",
];

function html(): string {
  return renderToStaticMarkup(<QuietHoursCard loadOnMount={false} />);
}

describe("QuietHoursCard", () => {
  it("renders the heading + description + form controls", () => {
    const out = html();
    expect(out).toContain("Quiet hours");
    expect(out).toContain('data-testid="quiet-hours-card"');
    expect(out).toContain('data-testid="quiet-hours-enabled"');
    expect(out).toContain('data-testid="quiet-hours-start"');
    expect(out).toContain('data-testid="quiet-hours-end"');
    expect(out).toContain('data-testid="quiet-hours-timezone"');
    expect(out).toContain('data-testid="quiet-hours-save"');
  });

  it("contains coach-voice copy that frames the window as user-owned (no dark-pattern phrases)", () => {
    const out = html();
    for (const phrase of FORBIDDEN_PHRASES) {
      expect(out, `quiet-hours copy must not contain "${phrase}"`).not.toContain(phrase);
    }
    // Positive coach-voice marker — the copy should reassure that nothing is dropped.
    expect(out.toLowerCase()).toContain("waits until the window ends");
  });

  it("does not render the saved banner on first paint", () => {
    const out = html();
    expect(out).not.toContain('data-testid="quiet-hours-saved-banner"');
    expect(out).not.toContain('data-testid="quiet-hours-error-banner"');
  });

  it("renders the default 22:00 / 08:00 window when no initialConfig is supplied", () => {
    const out = html();
    expect(out).toContain('value="22:00"');
    expect(out).toContain('value="08:00"');
  });

  it("respects an initialConfig override (15:00 / 06:00, disabled)", () => {
    const out = renderToStaticMarkup(
      <QuietHoursCard
        loadOnMount={false}
        initialConfig={{
          enabled: false,
          start_min: 15 * 60,
          end_min: 6 * 60,
          timezone: "Europe/London",
        }}
      />,
    );
    expect(out).toContain('value="15:00"');
    expect(out).toContain('value="06:00"');
    // The unchecked checkbox should not have `checked` attribute.
    expect(out).not.toMatch(/data-testid="quiet-hours-enabled"[^>]*checked/);
  });
});
