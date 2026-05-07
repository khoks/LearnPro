import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TutorModeCard } from "./TutorModeCard.js";

void React;

// STORY-036 — Anti-dark-pattern guard. Mirrors STORY-022 / STORY-023 / STORY-024
// forbidden-phrase tests. The settings UI must stay coach-voice: no FOMO, no scare
// tactics, no all-caps imperatives. Quality is mentioned factually ("may be lower"),
// not coercively ("DON'T MISS OUT ON CLOUD").
const FORBIDDEN_PHRASES = [
  "DON'T LOSE",
  "DON'T MISS",
  "DAY X",
  "burn",
  "BURN",
  "🔥",
  "⚠️",
  "lose your streak",
  "fall behind",
  "OR ELSE",
  "WARNING:",
];

function html(): string {
  return renderToStaticMarkup(<TutorModeCard loadOnMount={false} />);
}

describe("TutorModeCard", () => {
  it("renders the heading + the three radio options + save button", () => {
    const out = html();
    expect(out).toContain("Tutor mode");
    expect(out).toContain('data-testid="tutor-mode-card"');
    expect(out).toContain('data-testid="tutor-mode-radio-cloud"');
    expect(out).toContain('data-testid="tutor-mode-radio-local"');
    expect(out).toContain('data-testid="tutor-mode-radio-auto-fallback"');
    expect(out).toContain('data-testid="tutor-mode-save"');
  });

  it("contains coach-voice copy that frames each mode neutrally (no dark-pattern phrases)", () => {
    const out = html();
    for (const phrase of FORBIDDEN_PHRASES) {
      expect(out, `tutor-mode copy must not contain "${phrase}"`).not.toContain(phrase);
    }
    // Positive coach-voice markers — copy frames the choice as a tradeoff, not a coercion.
    expect(out).toContain("data stays on your machine");
    expect(out).toContain("fast and high-quality");
  });

  it("does not render the saved banner on first paint", () => {
    const out = html();
    expect(out).not.toContain('data-testid="tutor-mode-saved-banner"');
    expect(out).not.toContain('data-testid="tutor-mode-error-banner"');
  });

  it("defaults to cloud when no initialSettings is supplied", () => {
    const out = html();
    expect(out).toMatch(/data-testid="tutor-mode-radio-cloud"[\s\S]*?<input[^>]*checked/);
    // Local target should be hidden when the user is on cloud — only shown for local /
    // auto-fallback modes.
    expect(out).not.toContain('data-testid="tutor-mode-ollama-target"');
  });

  it("respects an initialSettings override (local mode + custom Ollama target)", () => {
    const out = renderToStaticMarkup(
      <TutorModeCard
        loadOnMount={false}
        initialSettings={{
          mode: "local",
          ollama_base_url: "http://192.168.1.42:11434",
          ollama_model: "qwen2.5-coder:14b-instruct",
        }}
      />,
    );
    expect(out).toMatch(/data-testid="tutor-mode-radio-local"[\s\S]*?<input[^>]*checked/);
    // Local target visible + populated.
    expect(out).toContain('data-testid="tutor-mode-ollama-target"');
    expect(out).toContain("192.168.1.42");
    expect(out).toContain("qwen2.5-coder:14b-instruct");
  });

  it("shows the Ollama target panel for auto-fallback mode too", () => {
    const out = renderToStaticMarkup(
      <TutorModeCard
        loadOnMount={false}
        initialSettings={{
          mode: "auto-fallback",
          ollama_base_url: "http://localhost:11434",
          ollama_model: "llama3.1:8b-instruct",
        }}
      />,
    );
    expect(out).toContain('data-testid="tutor-mode-ollama-target"');
  });

  it("includes a pointer to the self-host docs", () => {
    const out = renderToStaticMarkup(
      <TutorModeCard
        loadOnMount={false}
        initialSettings={{
          mode: "local",
          ollama_base_url: "http://localhost:11434",
          ollama_model: "llama3.1:8b-instruct",
        }}
      />,
    );
    expect(out).toContain("SELF_HOST_OLLAMA.md");
  });
});
