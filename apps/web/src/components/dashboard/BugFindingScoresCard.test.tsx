import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BugFindingScoresCard, type BugFindingScoreRow } from "./BugFindingScoresCard.js";

void React;

// STORY-037b — render-to-string tests for the dashboard's bug-finding scores card.
// Anti-dark-pattern stance is enforced HERE: no "weakness", no "DON'T", no FOMO timers, no
// fire / warning emoji, no all-caps imperatives. The bug-finding score is reframed as growth,
// not deficit.

function html(node: ReturnType<typeof BugFindingScoresCard>): string {
  return renderToStaticMarkup(node);
}

// Strip inline style attributes so forbidden-phrase + raw-score assertions don't false-fire
// on tokens that legitimately appear in CSS (e.g. "gap:0.6rem", "font-size:0.85rem", or
// `data-testid` attribute names containing underscores).
function visibleText(rendered: string): string {
  return rendered
    .replace(/\sstyle="[^"]*"/g, "")
    .replace(/\saria-label="[^"]*"/g, "")
    .replace(/\sdata-testid="[^"]*"/g, "")
    .replace(/\sid="[^"]*"/g, "");
}

const FORBIDDEN_PHRASES = [
  // EPIC-011 anti-dark-pattern table — the dashboard must never render any of these.
  "DON'T LOSE",
  "DAY X",
  "burn",
  "BURN",
  "weakness",
  "Weakness",
  "WEAKNESS",
  "weak",
  "Weak",
  "deficit",
  "Deficit",
  "gap",
  "Gap",
  "you're failing",
  "You're failing",
  "you are failing",
  "remedial",
  "Remedial",
  "struggle",
  "Struggle",
  // Urgency / loss-aversion emoji.
  "🔥",
  "⚠️",
];

function assertNoForbiddenPhrases(rendered: string, where: string): void {
  const stripped = visibleText(rendered);
  for (const phrase of FORBIDDEN_PHRASES) {
    expect(
      stripped,
      `${where}: forbidden phrase "${phrase}" — bug-finding card must reframe as growth, not deficit`,
    ).not.toContain(phrase);
  }
}

const ALL_8_COLD_START: BugFindingScoreRow[] = [
  { bug_archetype: "off_by_one", score: 0.5, attempts: 0 },
  { bug_archetype: "mutation_in_iteration", score: 0.5, attempts: 0 },
  { bug_archetype: "reference_equality", score: 0.5, attempts: 0 },
  { bug_archetype: "async_race", score: 0.5, attempts: 0 },
  { bug_archetype: "late_binding", score: 0.5, attempts: 0 },
  { bug_archetype: "shadowing", score: 0.5, attempts: 0 },
  { bug_archetype: "type_coercion", score: 0.5, attempts: 0 },
  { bug_archetype: "default_arg_mutability", score: 0.5, attempts: 0 },
];

describe("BugFindingScoresCard — STORY-037b", () => {
  it("renders the empty state when scores is an empty array", () => {
    const out = html(<BugFindingScoresCard scores={[]} />);
    expect(out).toContain("Bug archetypes you&#x27;ve worked through");
    expect(out).toContain("Try a debug problem to see your bug-finding scores here.");
    // Empty state has no list/rows.
    expect(out).not.toContain('data-testid="bug-finding-scores-card-list"');
  });

  it("renders the empty state when every archetype has 0 attempts (cold-start)", () => {
    // The API always returns all 8 archetypes including untouched cold-start rows. Untouched
    // means attempts=0 — the card treats this as "no data yet" and renders the empty state.
    const out = html(<BugFindingScoresCard scores={ALL_8_COLD_START} />);
    expect(out).toContain("Try a debug problem to see your bug-finding scores here.");
    expect(out).not.toContain('data-testid="bug-finding-scores-card-list"');
  });

  it("renders one row per touched archetype (partial state)", () => {
    const scores: BugFindingScoreRow[] = [
      { bug_archetype: "off_by_one", score: 0.85, attempts: 5 },
      { bug_archetype: "shadowing", score: 0.5, attempts: 0 },
      { bug_archetype: "async_race", score: 0.3, attempts: 2 },
    ];
    const out = html(<BugFindingScoresCard scores={scores} />);
    expect(out).toContain('data-testid="bug-finding-scores-card-list"');
    expect(out).toContain("Off-by-one");
    expect(out).toContain("Async race");
    // Untouched archetypes (attempts=0) are filtered out of the list.
    expect(out).not.toContain('data-testid="bug-finding-row-shadowing"');
  });

  it("renders all 8 archetypes when each has at least 1 attempt (full state)", () => {
    const scores: BugFindingScoreRow[] = [
      { bug_archetype: "off_by_one", score: 0.8, attempts: 6 },
      { bug_archetype: "mutation_in_iteration", score: 0.55, attempts: 3 },
      { bug_archetype: "reference_equality", score: 0.45, attempts: 2 },
      { bug_archetype: "async_race", score: 0.35, attempts: 4 },
      { bug_archetype: "late_binding", score: 0.6, attempts: 1 },
      { bug_archetype: "shadowing", score: 0.5, attempts: 1 },
      { bug_archetype: "type_coercion", score: 0.7, attempts: 5 },
      { bug_archetype: "default_arg_mutability", score: 0.25, attempts: 2 },
    ];
    const out = html(<BugFindingScoresCard scores={scores} />);
    expect(out).toContain("Off-by-one");
    expect(out).toContain("Mutation in iteration");
    expect(out).toContain("Reference equality");
    expect(out).toContain("Async race");
    expect(out).toContain("Late binding");
    expect(out).toContain("Shadowing");
    expect(out).toContain("Type coercion");
    expect(out).toContain("Default-arg mutability");
  });

  it("sorts rows by descending attempt count, ties broken by humanized label", () => {
    const scores: BugFindingScoreRow[] = [
      { bug_archetype: "shadowing", score: 0.6, attempts: 2 },
      { bug_archetype: "off_by_one", score: 0.4, attempts: 5 },
      // "async_race" and "late_binding" both have 3 attempts → break tie by label.
      // "Async race" sorts before "Late binding" alphabetically.
      { bug_archetype: "late_binding", score: 0.6, attempts: 3 },
      { bug_archetype: "async_race", score: 0.5, attempts: 3 },
    ];
    const out = html(<BugFindingScoresCard scores={scores} />);
    const idxOff = out.indexOf("Off-by-one");
    const idxAsync = out.indexOf("Async race");
    const idxLate = out.indexOf("Late binding");
    const idxShadow = out.indexOf("Shadowing");
    expect(idxOff).toBeGreaterThan(-1);
    expect(idxAsync).toBeGreaterThan(-1);
    expect(idxLate).toBeGreaterThan(-1);
    expect(idxShadow).toBeGreaterThan(-1);
    // Order: Off-by-one (5) < Async race (3) < Late binding (3) < Shadowing (2)
    expect(idxOff).toBeLessThan(idxAsync);
    expect(idxAsync).toBeLessThan(idxLate);
    expect(idxLate).toBeLessThan(idxShadow);
  });

  it("renders the 'Solid' band for high-score archetypes", () => {
    const out = html(
      <BugFindingScoresCard scores={[{ bug_archetype: "off_by_one", score: 0.9, attempts: 5 }]} />,
    );
    expect(out).toContain("Solid");
    expect(out).not.toContain("Still learning");
  });

  it("renders the 'Getting there' band for mid-score archetypes", () => {
    const out = html(
      <BugFindingScoresCard scores={[{ bug_archetype: "off_by_one", score: 0.55, attempts: 3 }]} />,
    );
    expect(out).toContain("Getting there");
    expect(out).not.toContain("Solid");
    expect(out).not.toContain("Still learning");
  });

  it("renders the 'Still learning' band for low-score archetypes (no shaming framing)", () => {
    const out = html(
      <BugFindingScoresCard scores={[{ bug_archetype: "off_by_one", score: 0.2, attempts: 4 }]} />,
    );
    expect(out).toContain("Still learning");
    expect(out).not.toContain("Solid");
    expect(out).not.toContain("Getting there");
  });

  it("never surfaces the raw score value (no percentile, no 0.85, no 85%)", () => {
    const out = visibleText(
      html(
        <BugFindingScoresCard
          scores={[{ bug_archetype: "off_by_one", score: 0.8567, attempts: 4 }]}
        />,
      ),
    );
    // No raw decimal score
    expect(out).not.toContain("0.85");
    expect(out).not.toContain("0.8567");
    // No percentage
    expect(out).not.toContain("85%");
    expect(out).not.toContain("86%");
    // No "X out of Y" framing
    expect(out).not.toMatch(/score:\s*\d/i);
  });

  it("pluralizes the attempt count correctly (1 attempt vs N attempts)", () => {
    const single = html(
      <BugFindingScoresCard scores={[{ bug_archetype: "off_by_one", score: 0.5, attempts: 1 }]} />,
    );
    expect(single).toContain("1 attempt");
    expect(single).not.toContain("1 attempts");

    const many = html(
      <BugFindingScoresCard scores={[{ bug_archetype: "off_by_one", score: 0.5, attempts: 7 }]} />,
    );
    expect(many).toContain("7 attempts");
  });

  it("never uses 'weakness' / 'gap' / shame framing — bug score is growth, not deficit", () => {
    // Render every state shape we expose to make the assertion airtight.
    const variants = [
      html(<BugFindingScoresCard scores={[]} />),
      html(<BugFindingScoresCard scores={ALL_8_COLD_START} />),
      html(
        <BugFindingScoresCard
          scores={[
            { bug_archetype: "off_by_one", score: 0.1, attempts: 3 },
            { bug_archetype: "shadowing", score: 0.95, attempts: 7 },
          ]}
        />,
      ),
    ];
    for (let i = 0; i < variants.length; i++) {
      assertNoForbiddenPhrases(variants[i] ?? "", `variant #${i}`);
    }
  });

  it("uses warm coach-voice copy throughout (no FOMO, no shame, no urgency)", () => {
    const out = visibleText(
      html(
        <BugFindingScoresCard
          scores={[{ bug_archetype: "off_by_one", score: 0.2, attempts: 3 }]}
        />,
      ),
    );
    const lower = out.toLowerCase();
    // Anti-dark-pattern: never coercive language.
    expect(lower).not.toContain("you need to");
    expect(lower).not.toContain("you should");
    expect(lower).not.toContain("don't lose");
    expect(lower).not.toContain("losing");
    expect(lower).not.toContain("forget");
    // Never accusatory.
    expect(lower).not.toContain("you struggle");
    expect(lower).not.toContain("you fail");
    expect(lower).not.toContain("grade you");
    expect(lower).not.toContain("rank");
  });
});
