import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EmailDigestCard } from "./EmailDigestCard.js";

void React;

// Anti-dark-pattern guard — mirrors STORY-022 / STORY-023 / STORY-024 forbidden-phrase tests.
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
  "don't miss",
  "limited time",
  "act now",
  "last chance",
];

function html(): string {
  return renderToStaticMarkup(<EmailDigestCard loadOnMount={false} />);
}

describe("EmailDigestCard", () => {
  it("renders the heading + description + form controls", () => {
    const out = html();
    expect(out).toContain("Email digests");
    expect(out).toContain('data-testid="email-digest-card"');
    expect(out).toContain('data-testid="email-daily-checkbox"');
    expect(out).toContain('data-testid="email-weekly-checkbox"');
    expect(out).toContain('data-testid="email-weekly-day"');
    expect(out).toContain('data-testid="email-digest-save"');
  });

  it("contains coach-voice copy with no dark-pattern phrases", () => {
    const out = html();
    for (const phrase of FORBIDDEN_PHRASES) {
      expect(out, `email-digest copy must not contain "${phrase}"`).not.toContain(phrase);
    }
    // Positive coach-voice marker — opt-out friendliness is explicitly called out.
    expect(out.toLowerCase()).toContain("off by default");
    expect(out.toLowerCase()).toContain("one-click unsubscribe");
  });

  it("does not render the saved banner on first paint", () => {
    const out = html();
    expect(out).not.toContain('data-testid="email-digest-saved-banner"');
    expect(out).not.toContain('data-testid="email-digest-error-banner"');
  });

  it("renders both checkboxes unchecked by default (opt-in)", () => {
    const out = html();
    expect(out).not.toMatch(/data-testid="email-daily-checkbox"[^>]*checked/);
    expect(out).not.toMatch(/data-testid="email-weekly-checkbox"[^>]*checked/);
  });

  it("renders the weekly-day picker with all 7 weekdays", () => {
    const out = html();
    expect(out).toContain("Monday");
    expect(out).toContain("Tuesday");
    expect(out).toContain("Wednesday");
    expect(out).toContain("Thursday");
    expect(out).toContain("Friday");
    expect(out).toContain("Saturday");
    expect(out).toContain("Sunday");
  });

  it("respects an initialPrefs override (daily on, weekly off, day=Friday)", () => {
    const out = renderToStaticMarkup(
      <EmailDigestCard
        loadOnMount={false}
        initialPrefs={{
          daily_opt_in: true,
          weekly_opt_in: false,
          weekly_day_of_week: 5,
        }}
      />,
    );
    // Daily checkbox is checked.
    expect(out).toMatch(/data-testid="email-daily-checkbox"[^>]*checked/);
    // Weekly checkbox is not.
    expect(out).not.toMatch(/data-testid="email-weekly-checkbox"[^>]*checked/);
    // The Friday option is the selected default in the dropdown.
    expect(out).toContain('value="5"');
  });

  it("respects an initialPrefs override (weekly on with Wednesday)", () => {
    const out = renderToStaticMarkup(
      <EmailDigestCard
        loadOnMount={false}
        initialPrefs={{
          daily_opt_in: false,
          weekly_opt_in: true,
          weekly_day_of_week: 3,
        }}
      />,
    );
    expect(out).toMatch(/data-testid="email-weekly-checkbox"[^>]*checked/);
    // Day picker is enabled when weekly is on — there's no `disabled` keyword on the <select>.
    const selectMatch = /<select([^>]*)data-testid="email-weekly-day"([^>]*)>/.exec(out);
    expect(selectMatch).not.toBeNull();
    const tagAttrs = (selectMatch?.[1] ?? "") + (selectMatch?.[2] ?? "");
    expect(tagAttrs).not.toContain("disabled");
  });

  it("disables the weekday picker when weekly is off", () => {
    const out = renderToStaticMarkup(
      <EmailDigestCard
        loadOnMount={false}
        initialPrefs={{
          daily_opt_in: false,
          weekly_opt_in: false,
          weekly_day_of_week: 1,
        }}
      />,
    );
    // React's renderToStaticMarkup may emit `disabled` before `data-testid`; just look for the
    // `disabled` keyword in the same `<select ...>` opening tag.
    const selectMatch = /<select([^>]*)data-testid="email-weekly-day"([^>]*)>/.exec(out);
    expect(selectMatch).not.toBeNull();
    const tagAttrs = (selectMatch?.[1] ?? "") + (selectMatch?.[2] ?? "");
    expect(tagAttrs).toContain("disabled");
  });
});
