"use client";

import * as React from "react";
import { useCallback, useEffect, useState } from "react";

void React;

// STORY-036 — settings card for the per-user `tutor_mode` toggle. Three radio options:
//
//   - Cloud (Anthropic Claude) — the high-quality default.
//   - Local (Ollama) — runs on the user's hardware; quality lower but data stays put.
//   - Auto-fallback — try cloud first, fall back to local on cloud failure.
//
// Coach-voice copy frames the choice neutrally — both modes are described in factual,
// non-coercive terms. We never imply local is "broken" or that cloud is "the only good
// choice"; the bet is the privacy-conscious audience understands the tradeoff.

export type TutorMode = "cloud" | "local" | "auto-fallback";

export interface TutorModeSettings {
  mode: TutorMode;
  ollama_base_url?: string;
  ollama_model?: string;
}

export interface TutorModeCardProps {
  fetcher?: typeof fetch;
  loadOnMount?: boolean;
  initialSettings?: TutorModeSettings;
}

const DEFAULT_SETTINGS: TutorModeSettings = {
  mode: "cloud",
  ollama_base_url: "http://localhost:11434",
  ollama_model: "llama3.1:8b-instruct",
};

const CARD_STYLE: React.CSSProperties = {
  border: "1px solid #ddd",
  borderRadius: 8,
  padding: "1rem 1.25rem",
  background: "white",
  display: "flex",
  flexDirection: "column",
  gap: "0.75rem",
};

const ROW_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: "0.75rem",
};

const LABEL_STYLE: React.CSSProperties = {
  fontWeight: 600,
  fontSize: "0.95rem",
};

const HELP_STYLE: React.CSSProperties = {
  fontSize: "0.85rem",
  color: "#555",
  lineHeight: 1.4,
};

const BUTTON_STYLE: React.CSSProperties = {
  background: "#3a82f7",
  color: "white",
  border: "none",
  borderRadius: 6,
  padding: "0.5rem 1rem",
  fontWeight: 600,
  cursor: "pointer",
};

const TARGET_STYLE: React.CSSProperties = {
  fontSize: "0.8rem",
  color: "#777",
  fontFamily: "ui-monospace, SFMono-Regular, monospace",
};

type SaveState = "idle" | "saving" | "saved" | "error";

const MODE_OPTIONS: ReadonlyArray<{
  value: TutorMode;
  label: string;
  description: string;
}> = [
  {
    value: "cloud",
    label: "Cloud (Anthropic Claude)",
    description:
      "We default to Anthropic Claude in the cloud — fast and high-quality. Your code and conversations are sent to Anthropic for tutoring; LearnPro never trains on your data.",
  },
  {
    value: "local",
    label: "Local (Ollama)",
    description:
      "Local mode runs on your hardware via Ollama; quality may be lower but your data stays on your machine. Embeddings-based features (concept similarity) are skipped in local mode.",
  },
  {
    value: "auto-fallback",
    label: "Auto-fallback (cloud, then local)",
    description:
      "Tries cloud first; if the cloud call fails (offline, budget exhausted, error), falls back to your local Ollama install for the rest of that request.",
  },
];

export function TutorModeCard(props: TutorModeCardProps = {}): React.ReactElement {
  const fetcher = props.fetcher ?? (typeof fetch !== "undefined" ? fetch : undefined);
  const initial = props.initialSettings ?? DEFAULT_SETTINGS;

  const [mode, setMode] = useState<TutorMode>(initial.mode);
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState<string>(
    initial.ollama_base_url ?? DEFAULT_SETTINGS.ollama_base_url ?? "",
  );
  const [ollamaModel, setOllamaModel] = useState<string>(
    initial.ollama_model ?? DEFAULT_SETTINGS.ollama_model ?? "",
  );
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!fetcher) return;
    try {
      const res = await fetcher("/api/settings/llm-mode");
      if (!res.ok) return;
      const body = (await res.json()) as TutorModeSettings;
      setMode(body.mode);
      if (body.ollama_base_url) setOllamaBaseUrl(body.ollama_base_url);
      if (body.ollama_model) setOllamaModel(body.ollama_model);
    } catch {
      // soft-fail: stay on the rendered defaults
    }
  }, [fetcher]);

  useEffect(() => {
    if (props.loadOnMount === false) return;
    void refresh();
  }, [refresh, props.loadOnMount]);

  const onSave = useCallback(async () => {
    if (!fetcher) return;
    setSaveState("saving");
    setErrorMessage(null);
    try {
      const res = await fetcher("/api/settings/llm-mode", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
        setSaveState("error");
        setErrorMessage(body.message ?? body.error ?? `Save failed (HTTP ${res.status}).`);
        return;
      }
      setSaveState("saved");
    } catch (err) {
      setSaveState("error");
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  }, [fetcher, mode]);

  const showOllamaTarget = mode === "local" || mode === "auto-fallback";

  return (
    <section
      aria-labelledby="tutor-mode-heading"
      style={CARD_STYLE}
      data-testid="tutor-mode-card"
    >
      <div>
        <h2 id="tutor-mode-heading" style={{ margin: 0, fontSize: "1.05rem" }}>
          Tutor mode
        </h2>
        <p style={HELP_STYLE}>
          Pick which large language model powers the tutor. Cloud is the default; local mode
          is for self-hosters who want their data to stay on their own hardware.
        </p>
      </div>

      <fieldset
        style={{ border: 0, padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}
      >
        <legend style={{ ...LABEL_STYLE, marginBottom: "0.25rem" }}>Provider</legend>
        {MODE_OPTIONS.map((opt) => (
          <label
            key={opt.value}
            style={ROW_STYLE}
            data-testid={`tutor-mode-radio-${opt.value}`}
          >
            <input
              type="radio"
              name="tutor-mode"
              value={opt.value}
              checked={mode === opt.value}
              onChange={() => setMode(opt.value)}
              style={{ marginTop: "0.25rem" }}
            />
            <span style={{ display: "flex", flexDirection: "column", gap: "0.15rem" }}>
              <span style={LABEL_STYLE}>{opt.label}</span>
              <span style={HELP_STYLE}>{opt.description}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {showOllamaTarget ? (
        <div
          style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}
          data-testid="tutor-mode-ollama-target"
        >
          <span style={LABEL_STYLE}>Local target</span>
          <span style={TARGET_STYLE}>
            {ollamaBaseUrl} · {ollamaModel}
          </span>
          <span style={HELP_STYLE}>
            Set <code>OLLAMA_BASE_URL</code> and <code>OLLAMA_MODEL</code> on the LearnPro API
            server to point at a different Ollama install or model. Self-host setup steps live in{" "}
            <code>docs/operations/SELF_HOST_OLLAMA.md</code>.
          </span>
        </div>
      ) : null}

      <div style={ROW_STYLE}>
        <button
          type="button"
          style={BUTTON_STYLE}
          disabled={saveState === "saving"}
          onClick={onSave}
          data-testid="tutor-mode-save"
        >
          {saveState === "saving" ? "Saving…" : "Save"}
        </button>
        {saveState === "saved" ? (
          <span
            data-testid="tutor-mode-saved-banner"
            style={{ fontSize: "0.85rem", color: "#0a7c4a" }}
          >
            Saved. Tutor mode updated.
          </span>
        ) : null}
        {saveState === "error" ? (
          <span
            data-testid="tutor-mode-error-banner"
            style={{ fontSize: "0.85rem", color: "#9a1d1d" }}
          >
            {errorMessage ?? "Couldn't save."}
          </span>
        ) : null}
      </div>
    </section>
  );
}
