import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PortfolioCard, type PortfolioState } from "./PortfolioCard.js";

void React;

// STORY-040 — anti-dark-pattern + AC checks. Mirrors STORY-024's QuietHoursCard.test.tsx.
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

const CONNECTED: PortfolioState = {
  connected: true,
  repo: "learnpro-portfolio",
  auto_push: false,
  recent_pushes: [
    {
      id: "p1",
      episode_id: "e1",
      repo_owner: "octocat",
      repo_name: "learnpro-portfolio",
      directory_path: "python-fundamentals/two-sum",
      commit_sha: "abc",
      pushed_at: "2026-05-01T10:00:00Z",
      auto: false,
    },
  ],
};

function renderDisconnected(): string {
  return renderToStaticMarkup(<PortfolioCard loadOnMount={false} />);
}

function renderConnected(state: PortfolioState = CONNECTED): string {
  return renderToStaticMarkup(<PortfolioCard loadOnMount={false} initialState={state} />);
}

describe("PortfolioCard — disconnected state", () => {
  it("renders the heading + description + connect button", () => {
    const out = renderDisconnected();
    expect(out).toContain("GitHub portfolio");
    expect(out).toContain('data-testid="portfolio-card"');
    expect(out).toContain('data-testid="portfolio-connect-button"');
    expect(out).toContain("Connect GitHub portfolio");
    expect(out).toContain('data-connected="false"');
  });

  it("explicitly states `repo` scope in the disclosure (AC #1 + product copy)", () => {
    const out = renderDisconnected();
    expect(out).toContain('data-testid="portfolio-scope-disclosure"');
    expect(out).toContain("repo");
    expect(out).toContain("learnpro-portfolio");
    // Reassures the user it's revocable.
    expect(out).toContain("revoke access");
  });

  it("does NOT render the connected sub-tree (no recent pushes / disconnect)", () => {
    const out = renderDisconnected();
    expect(out).not.toContain('data-testid="portfolio-recent-pushes"');
    expect(out).not.toContain('data-testid="portfolio-disconnect-button"');
    expect(out).not.toContain('data-testid="portfolio-auto-push-toggle"');
  });

  it("contains coach-voice copy that frames ownership (no dark-pattern phrases)", () => {
    const out = renderDisconnected();
    for (const phrase of FORBIDDEN_PHRASES) {
      expect(out, `portfolio copy must not contain "${phrase}"`).not.toContain(phrase);
    }
    // Positive coach-voice marker — the copy reassures the user owns their work.
    expect(out.toLowerCase()).toContain("your work belongs to you");
  });
});

describe("PortfolioCard — connected state", () => {
  it("renders the repo name and disconnect button", () => {
    const out = renderConnected();
    expect(out).toContain('data-connected="true"');
    expect(out).toContain('data-testid="portfolio-repo-name"');
    expect(out).toContain("learnpro-portfolio");
    expect(out).toContain('data-testid="portfolio-disconnect-button"');
  });

  it("renders the auto-push toggle (default OFF per AC #5)", () => {
    const out = renderConnected();
    expect(out).toContain('data-testid="portfolio-auto-push-toggle"');
    // Unchecked checkbox — no `checked` attribute on the input.
    expect(out).not.toMatch(
      /<input[^>]*data-testid="portfolio-auto-push-toggle"[^>]*checked/,
    );
  });

  it("renders the auto-push toggle as checked when the state has auto_push: true", () => {
    const out = renderConnected({ ...CONNECTED, auto_push: true });
    expect(out).toMatch(/<input[^>]*data-testid="portfolio-auto-push-toggle"[^>]*checked/);
  });

  it("renders recent pushes as links to the GitHub directory", () => {
    const out = renderConnected();
    expect(out).toContain('data-testid="portfolio-recent-pushes"');
    expect(out).toContain(
      "https://github.com/octocat/learnpro-portfolio/tree/HEAD/python-fundamentals/two-sum",
    );
    expect(out).toContain("python-fundamentals/two-sum");
  });

  it("renders the empty-state copy when no pushes yet (no shame)", () => {
    const out = renderConnected({ ...CONNECTED, recent_pushes: [] });
    expect(out).toContain('data-testid="portfolio-empty-pushes"');
    expect(out).toContain("Nothing here yet");
  });

  it("contains coach-voice copy in the connected view too", () => {
    const out = renderConnected({ ...CONNECTED, recent_pushes: [] });
    for (const phrase of FORBIDDEN_PHRASES) {
      expect(out, `portfolio connected copy must not contain "${phrase}"`).not.toContain(phrase);
    }
  });
});

describe("PortfolioCard — OAuth status banner", () => {
  it("shows a success banner when oauthStatus=connected", () => {
    const out = renderToStaticMarkup(
      <PortfolioCard
        loadOnMount={false}
        initialState={CONNECTED}
        oauthStatus="connected"
        oauthOwner="octocat"
      />,
    );
    expect(out).toContain('data-testid="portfolio-oauth-banner"');
    expect(out).toContain('data-status="connected"');
    expect(out).toContain("octocat");
    expect(out).toContain("GitHub portfolio connected");
  });

  it("shows a coach-voice 'no worries' banner when the user denies on GitHub", () => {
    const out = renderToStaticMarkup(
      <PortfolioCard loadOnMount={false} oauthStatus="denied" />,
    );
    expect(out).toContain('data-testid="portfolio-oauth-banner"');
    expect(out).toContain('data-status="denied"');
    expect(out).toContain("No worries");
  });

  it("shows a missing_scope banner explaining the user must grant `repo`", () => {
    const out = renderToStaticMarkup(
      <PortfolioCard loadOnMount={false} oauthStatus="missing_scope" />,
    );
    expect(out).toContain("repo");
    expect(out).toContain("scope");
  });

  it("does NOT render the banner when oauthStatus is unset", () => {
    const out = renderToStaticMarkup(<PortfolioCard loadOnMount={false} />);
    expect(out).not.toContain('data-testid="portfolio-oauth-banner"');
  });

  it("does NOT render the banner for an unknown status string (defends against URL tampering)", () => {
    const out = renderToStaticMarkup(
      <PortfolioCard loadOnMount={false} oauthStatus="totally-fake-status" />,
    );
    expect(out).not.toContain('data-testid="portfolio-oauth-banner"');
  });
});
