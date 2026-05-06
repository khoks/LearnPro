import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SaveToPortfolioButton } from "./SaveToPortfolioButton.js";

void React;

const FORBIDDEN_PHRASES = [
  "DON'T LOSE",
  "DAY X",
  "burn",
  "BURN",
  "🔥",
  "⚠️",
  "miss",
  "lose your streak",
];

describe("SaveToPortfolioButton — visibility gating", () => {
  it("renders nothing for a failed outcome (AC: only on passing)", () => {
    const out = renderToStaticMarkup(
      <SaveToPortfolioButton
        episodeId="11111111-1111-1111-1111-111111111111"
        finalOutcome="failed"
        initialConnected={true}
      />,
    );
    expect(out).toBe("");
  });

  it("renders nothing for an abandoned outcome", () => {
    const out = renderToStaticMarkup(
      <SaveToPortfolioButton
        episodeId="11111111-1111-1111-1111-111111111111"
        finalOutcome="abandoned"
        initialConnected={true}
      />,
    );
    expect(out).toBe("");
  });

  it("renders nothing when connected is false (passing but no portfolio yet)", () => {
    const out = renderToStaticMarkup(
      <SaveToPortfolioButton
        episodeId="11111111-1111-1111-1111-111111111111"
        finalOutcome="passed"
        initialConnected={false}
      />,
    );
    expect(out).toBe("");
  });

  it("renders the button when passed AND connected=true", () => {
    const out = renderToStaticMarkup(
      <SaveToPortfolioButton
        episodeId="11111111-1111-1111-1111-111111111111"
        finalOutcome="passed"
        initialConnected={true}
      />,
    );
    expect(out).toContain('data-testid="save-to-portfolio-button"');
    expect(out).toContain("Save to portfolio");
  });

  it("renders the button when passed_with_hints (also a passing variant)", () => {
    const out = renderToStaticMarkup(
      <SaveToPortfolioButton
        episodeId="11111111-1111-1111-1111-111111111111"
        finalOutcome="passed_with_hints"
        initialConnected={true}
      />,
    );
    expect(out).toContain('data-testid="save-to-portfolio-button"');
  });
});

describe("SaveToPortfolioButton — coach-voice copy", () => {
  it("first paint contains no forbidden / dark-pattern phrases", () => {
    const out = renderToStaticMarkup(
      <SaveToPortfolioButton
        episodeId="11111111-1111-1111-1111-111111111111"
        finalOutcome="passed"
        initialConnected={true}
      />,
    );
    for (const phrase of FORBIDDEN_PHRASES) {
      expect(out, `save-to-portfolio button must not contain "${phrase}"`).not.toContain(phrase);
    }
  });
});
