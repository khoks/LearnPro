import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  DueReviewsCard,
  HonestSessionsCard,
  ProfileInsightsCard,
  StreakCard,
  TrackProgressBar,
  XpCard,
} from "./dashboard-components.js";

// Reference React explicitly so vitest's classic-runtime JSX transform doesn't strip the
// import. (Without this, esbuild's classic JSX transform emits React.createElement calls and
// fails with `ReferenceError: React is not defined` at test-run time.)
void React;

// Render-to-string the pure components and grep their output for the wanted (and unwanted)
// copy. Avoids pulling in @testing-library — these components have no events / state / refs to
// test, just shape + copy.

function html(
  node: ReturnType<
    | typeof XpCard
    | typeof StreakCard
    | typeof TrackProgressBar
    | typeof DueReviewsCard
    | typeof HonestSessionsCard
    | typeof ProfileInsightsCard
  >,
): string {
  if (node === null) return "";
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

describe("DueReviewsCard (STORY-031)", () => {
  it("returns null when count is 0 (zero-state is absence, not noise)", () => {
    const node = DueReviewsCard({ count: 0, activeTrackSlug: "python-fundamentals" });
    expect(node).toBeNull();
  });

  it("renders singular phrasing for count === 1", () => {
    const out = html(<DueReviewsCard count={1} activeTrackSlug="python-fundamentals" />);
    expect(out).toContain("1 concept is ready for a quick review.");
    expect(out).toContain("Start a review session");
  });

  it("renders plural phrasing for count > 1", () => {
    const out = html(<DueReviewsCard count={5} activeTrackSlug="python-fundamentals" />);
    expect(out).toContain("5 concepts are ready for a quick review.");
  });

  it("CTA links to /session?track=...&review=1 when an active track is supplied", () => {
    const out = html(<DueReviewsCard count={3} activeTrackSlug="python-fundamentals" />);
    expect(out).toContain('href="/session?track=python-fundamentals&amp;review=1"');
  });

  it("CTA links to /session?review=1 when no active track", () => {
    const out = html(<DueReviewsCard count={3} activeTrackSlug={null} />);
    expect(out).toContain('href="/session?review=1"');
  });

  it("uses warm coach voice — no urgency, no shame, no forbidden phrases", () => {
    assertNoForbiddenPhrases(
      html(<DueReviewsCard count={7} activeTrackSlug="python-fundamentals" />),
    );
    const out = html(<DueReviewsCard count={3} activeTrackSlug="python-fundamentals" />);
    expect(out).not.toContain("forget");
    expect(out).not.toContain("losing");
    expect(out).not.toContain("fading");
  });
});

describe("HonestSessionsCard — STORY-042", () => {
  it("renders a soft empty-state at zero count (no shame, no pressure)", () => {
    const out = html(<HonestSessionsCard count={0} />);
    expect(out).toContain("Honest sessions");
    expect(out).toContain("—");
    expect(out).toContain("No pressure to use it");
  });

  it("renders the singular form at count=1", () => {
    const out = html(<HonestSessionsCard count={1} />);
    expect(out).toContain("1 problem marked");
    expect(out).toContain("makes adaptiveness sharper");
  });

  it("renders the plural form for higher counts", () => {
    const out = html(<HonestSessionsCard count={5} />);
    expect(out).toContain("5 problems marked");
  });

  it("never accuses, moralizes, or surfaces a ratio (anti-dark-pattern)", () => {
    const out = html(<HonestSessionsCard count={3} />);
    assertNoForbiddenPhrases(out);
    // STORY-042 — no accusatory framing.
    expect(out).not.toContain("cheat");
    expect(out).not.toContain("Cheat");
    expect(out).not.toContain("dishonest");
    // Never surface a ratio against total episodes — invites comparison + shaming.
    expect(out).not.toMatch(/got help \d+\s*\/\s*\d+/);
    expect(out).not.toContain("ratio");
    // STORY-042 — always frame as a positive (sharper adaptiveness, not a counter that pressures).
    expect(out.toLowerCase()).not.toContain("you got help");
  });

  it("contains no forbidden dark-pattern phrases at any count", () => {
    for (const n of [0, 1, 2, 9, 27]) {
      assertNoForbiddenPhrases(html(<HonestSessionsCard count={n} />));
    }
  });
});

describe("ProfileInsightsCard — STORY-033", () => {
  const I1 = {
    id: "11111111-1111-4111-8111-111111111111",
    text: "user reaches for `for` when comprehensions would be cleaner",
    concept_tags: ["loops"],
    referenced_count: 0,
  };
  const I2 = {
    id: "22222222-2222-4222-8222-222222222222",
    text: "edge cases consistently take an extra attempt",
    concept_tags: ["edge-cases"],
    referenced_count: 1,
  };
  const I3 = {
    id: "33333333-3333-4333-8333-333333333333",
    text: "the learner warms up before pushing harder",
    concept_tags: [],
    referenced_count: 0,
  };

  it("renders a soft empty state when there are no insights yet", () => {
    const out = html(<ProfileInsightsCard insights={[]} />);
    expect(out).toContain("Across your sessions");
    expect(out).toContain("Patterns will show up here after a few sessions");
    expect(out).toContain("not to grade you");
  });

  it("renders the insight texts as a list when supplied", () => {
    const out = html(<ProfileInsightsCard insights={[I1, I2]} />);
    expect(out).toContain("What I&#x27;ve noticed across your sessions");
    expect(out).toContain("user reaches for");
    expect(out).toContain("comprehensions would be cleaner");
    expect(out).toContain("edge cases consistently take an extra attempt");
  });

  it("caps at 3 insights", () => {
    const out = html(
      <ProfileInsightsCard
        insights={[
          I1,
          I2,
          I3,
          { ...I1, id: "44444444-4444-4444-8444-444444444444", text: "fourth obs" },
        ]}
      />,
    );
    expect(out).not.toContain("fourth obs");
  });

  it("never accuses, moralizes, or surfaces a ratio (anti-dark-pattern)", () => {
    const out = html(<ProfileInsightsCard insights={[I1, I2, I3]} />);
    assertNoForbiddenPhrases(out);
    const lower = out.toLowerCase();
    expect(lower).not.toContain("you struggle");
    expect(lower).not.toContain("you fail");
    expect(lower).not.toContain("grade you");
    expect(lower).not.toContain("rank");
  });

  it("contains no forbidden dark-pattern phrases at any size", () => {
    assertNoForbiddenPhrases(html(<ProfileInsightsCard insights={[]} />));
    assertNoForbiddenPhrases(html(<ProfileInsightsCard insights={[I1]} />));
    assertNoForbiddenPhrases(html(<ProfileInsightsCard insights={[I1, I2, I3]} />));
  });
});
