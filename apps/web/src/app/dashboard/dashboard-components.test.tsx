import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StreakCard, TrackProgressBar, XpCard } from "./dashboard-components.js";

// Reference React explicitly so vitest's classic-runtime JSX transform doesn't strip the
// import. (Without this, esbuild's classic JSX transform emits React.createElement calls and
// fails with `ReferenceError: React is not defined` at test-run time.)
void React;

// Render-to-string the pure components and grep their output for the wanted (and unwanted)
// copy. Avoids pulling in @testing-library — these components have no events / state / refs to
// test, just shape + copy.

function html(
  node: ReturnType<typeof XpCard | typeof StreakCard | typeof TrackProgressBar>,
): string {
  return renderToStaticMarkup(node);
}

const FORBIDDEN_PHRASES = [
  // EPIC-011 anti-dark-pattern table — these are the strings the dashboard must never render.
  "DON'T LOSE",
  "DAY X",
  "burn",
  "BURN",
  // Urgency / loss-aversion emoji.
  "🔥",
  "⚠️",
];

function assertNoForbiddenPhrases(rendered: string): void {
  for (const phrase of FORBIDDEN_PHRASES) {
    expect(
      rendered,
      `dashboard copy must not contain forbidden phrase "${phrase}" (EPIC-011 anti-dark-pattern stance)`,
    ).not.toContain(phrase);
  }
}

describe("XpCard", () => {
  it("renders the XP value with thousands separator", () => {
    const out = html(<XpCard xp={12345} />);
    expect(out).toContain("12,345");
    expect(out).toContain("Lifetime XP");
  });

  it("renders 0 XP without crashing", () => {
    const out = html(<XpCard xp={0} />);
    expect(out).toContain(">0<");
  });

  it("contains no forbidden dark-pattern phrases", () => {
    assertNoForbiddenPhrases(html(<XpCard xp={9999} />));
  });
});

describe("StreakCard", () => {
  it("renders a 0-day streak with a soft prompt (not shame)", () => {
    const out = html(
      <StreakCard
        streakDays={0}
        graceDaysRemaining={2}
        graceDaysUsedThisCheck={0}
        monthlyGraceCap={2}
      />,
    );
    expect(out).toContain("Start whenever you&#x27;re ready.");
    expect(out).toContain("No active streak yet.");
    expect(out).toContain("2 of 2 grace days left this month");
  });

  it("renders a 1-day streak with singular phrasing", () => {
    const out = html(
      <StreakCard
        streakDays={1}
        graceDaysRemaining={2}
        graceDaysUsedThisCheck={0}
        monthlyGraceCap={2}
      />,
    );
    expect(out).toContain("1-day streak");
    expect(out).toContain("You&#x27;ve practiced 1 day in a row.");
  });

  it("renders an N-day streak with plural phrasing", () => {
    const out = html(
      <StreakCard
        streakDays={7}
        graceDaysRemaining={1}
        graceDaysUsedThisCheck={0}
        monthlyGraceCap={2}
      />,
    );
    expect(out).toContain("7-day streak");
    expect(out).toContain("You&#x27;ve practiced 7 days in a row.");
    expect(out).toContain("1 of 2 grace days left this month");
  });

  it("surfaces grace usage when graces were consumed this check", () => {
    const out = html(
      <StreakCard
        streakDays={3}
        graceDaysRemaining={1}
        graceDaysUsedThisCheck={1}
        monthlyGraceCap={2}
      />,
    );
    expect(out).toContain("Used 1 grace day to keep your streak going.");
  });

  it("pluralizes grace usage messaging correctly", () => {
    const out = html(
      <StreakCard
        streakDays={5}
        graceDaysRemaining={0}
        graceDaysUsedThisCheck={2}
        monthlyGraceCap={2}
      />,
    );
    expect(out).toContain("Used 2 grace days to keep your streak going.");
  });

  it("contains no forbidden dark-pattern phrases", () => {
    // Render every variant we expose to make the assertion airtight.
    const variants = [0, 1, 5, 30].flatMap((streakDays) =>
      [0, 1, 2].map((graceUsed) =>
        html(
          <StreakCard
            streakDays={streakDays}
            graceDaysRemaining={2 - graceUsed}
            graceDaysUsedThisCheck={graceUsed}
            monthlyGraceCap={2}
          />,
        ),
      ),
    );
    for (const out of variants) {
      assertNoForbiddenPhrases(out);
    }
  });
});

describe("TrackProgressBar", () => {
  it("renders mastered/total + percentage", () => {
    const out = html(
      <TrackProgressBar
        trackName="Python fundamentals"
        trackSlug="python-fundamentals"
        language="python"
        mastered={3}
        total={10}
        ratio={0.3}
      />,
    );
    expect(out).toContain("Python fundamentals");
    expect(out).toContain("3 / 10");
    expect(out).toContain("30%");
  });

  it("emits a progressbar with aria-valuenow matching the rounded percentage", () => {
    const out = html(
      <TrackProgressBar
        trackName="TypeScript fundamentals"
        trackSlug="typescript-fundamentals"
        language="typescript"
        mastered={5}
        total={8}
        ratio={5 / 8}
      />,
    );
    expect(out).toContain('role="progressbar"');
    expect(out).toContain('aria-valuenow="63"'); // 62.5 rounds to 63
  });

  it("renders 0/0 / 0% gracefully (empty curriculum)", () => {
    const out = html(
      <TrackProgressBar
        trackName="Empty"
        trackSlug="empty"
        language="python"
        mastered={0}
        total={0}
        ratio={0}
      />,
    );
    expect(out).toContain("0 / 0");
    expect(out).toContain("0%");
  });

  it("contains no forbidden dark-pattern phrases", () => {
    assertNoForbiddenPhrases(
      html(
        <TrackProgressBar
          trackName="Python"
          trackSlug="python"
          language="python"
          mastered={1}
          total={9}
          ratio={1 / 9}
        />,
      ),
    );
  });
});
