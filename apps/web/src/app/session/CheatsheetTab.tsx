"use client";

import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import { downloadCheatsheetPdf } from "../../lib/cheatsheet-pdf";

// Reference React explicitly so vitest's classic-runtime JSX transform doesn't strip the
// import — same workaround pattern as the rest of apps/web.
void React;

// STORY-041 — in-app cheatsheet view for the session-recap screen. Self-contained client
// component: takes a list of episode IDs the session covered, calls the same-origin
// /api/cheatsheet proxy to either fetch an existing match (idempotent) or generate a fresh
// cheatsheet, and renders the markdown in a textarea the user can edit. The PDF export
// button defers to the pure `downloadCheatsheetPdf` helper in lib/cheatsheet-pdf.ts.
//
// Coach-voice copy: warm, calm, no FOMO timers / fire emoji / all-caps. Empty-state messaging
// reassures the user that an empty cheatsheet is fine — it just means the agent didn't pull
// anything specific from the session.

export interface CheatsheetEntry {
  concept: string;
  definition: string;
  code_example: string;
  gotcha: string;
}

export interface Cheatsheet {
  id: string;
  episodes_covered: string[];
  entries: CheatsheetEntry[];
  markdown_content: string;
  created_at: string;
  updated_at: string;
}

export interface CheatsheetTabProps {
  // Episode IDs the user just closed in this session — used to seed the generate request.
  // The proxy de-duplicates against existing cheatsheets covering the same episode set.
  episodeIds: string[];
  // Optional preloaded cheatsheet. When supplied, the component skips the generate call and
  // hydrates straight from this. Used by the /profile page where we already have the row.
  initialCheatsheet?: Cheatsheet;
}

type LoadingState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "saving" }
  | { kind: "exporting" }
  | { kind: "error"; message: string };

function copyForEmpty(): string {
  return "Nothing surfaced from this session worth pinning to a card. That's not a problem — it usually means the work was steady.";
}

function copyForGenerationFailure(): string {
  return "The cheatsheet writer is briefly unavailable. Your session still saved — try the generate button again in a moment.";
}

function buildFilename(c: Cheatsheet): string {
  const date = c.created_at.slice(0, 10);
  return `learnpro-cheatsheet-${date}.pdf`;
}

export function CheatsheetTab({
  episodeIds,
  initialCheatsheet,
}: CheatsheetTabProps): React.JSX.Element {
  const [cheatsheet, setCheatsheet] = useState<Cheatsheet | null>(initialCheatsheet ?? null);
  const [draftMarkdown, setDraftMarkdown] = useState<string>(
    initialCheatsheet?.markdown_content ?? "",
  );
  const [state, setState] = useState<LoadingState>(
    initialCheatsheet ? { kind: "idle" } : { kind: "loading" },
  );

  const generateOrLoad = useCallback(async () => {
    if (initialCheatsheet) return;
    if (episodeIds.length === 0) {
      setState({ kind: "idle" });
      return;
    }
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/cheatsheet", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ episode_ids: episodeIds }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "unknown" }));
        if (res.status === 503) {
          setState({ kind: "error", message: copyForGenerationFailure() });
          return;
        }
        setState({ kind: "error", message: body.message ?? `Request failed: ${res.status}` });
        return;
      }
      const body = (await res.json()) as { cheatsheet: Cheatsheet };
      setCheatsheet(body.cheatsheet);
      setDraftMarkdown(body.cheatsheet.markdown_content);
      setState({ kind: "idle" });
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, [episodeIds, initialCheatsheet]);

  useEffect(() => {
    void generateOrLoad();
  }, [generateOrLoad]);

  const onSave = useCallback(async () => {
    if (!cheatsheet) return;
    setState({ kind: "saving" });
    try {
      const res = await fetch(`/api/cheatsheet?id=${encodeURIComponent(cheatsheet.id)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ markdown_content: draftMarkdown }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: "save failed" }));
        setState({ kind: "error", message: body.message ?? `Save failed: ${res.status}` });
        return;
      }
      const body = (await res.json()) as { cheatsheet: Cheatsheet };
      setCheatsheet(body.cheatsheet);
      setDraftMarkdown(body.cheatsheet.markdown_content);
      setState({ kind: "idle" });
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, [cheatsheet, draftMarkdown]);

  const onExport = useCallback(() => {
    if (!cheatsheet) return;
    setState({ kind: "exporting" });
    try {
      // The PDF rendering is fully client-side. We pass the user's current draft (which
      // may include unsaved edits) so the printed copy matches what they see in the editor.
      downloadCheatsheetPdf(
        draftMarkdown || cheatsheet.markdown_content,
        buildFilename(cheatsheet),
      );
      setState({ kind: "idle" });
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, [cheatsheet, draftMarkdown]);

  if (state.kind === "loading") {
    return (
      <section
        aria-label="Cheatsheet"
        style={{ padding: "1rem", color: "#555", fontFamily: "system-ui, sans-serif" }}
      >
        Building your cheatsheet from this session…
      </section>
    );
  }
  if (state.kind === "error") {
    return (
      <section
        aria-label="Cheatsheet"
        style={{ padding: "1rem", fontFamily: "system-ui, sans-serif" }}
      >
        <p style={{ color: "#a33", margin: 0 }}>{state.message}</p>
        <button
          type="button"
          onClick={() => void generateOrLoad()}
          style={{
            marginTop: "0.75rem",
            padding: "0.4rem 0.8rem",
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </section>
    );
  }
  if (!cheatsheet) {
    return (
      <section
        aria-label="Cheatsheet"
        style={{ padding: "1rem", fontFamily: "system-ui, sans-serif", color: "#555" }}
      >
        {copyForEmpty()}
      </section>
    );
  }

  const hasEntries = cheatsheet.entries.length > 0;
  const isEdited = draftMarkdown !== cheatsheet.markdown_content;

  return (
    <section
      aria-label="Cheatsheet"
      style={{ padding: "1rem", fontFamily: "system-ui, sans-serif" }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: "0.75rem",
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 18 }}>Personal cheatsheet</h2>
          <p style={{ margin: "0.25rem 0 0", color: "#666", fontSize: 13 }}>
            {hasEntries
              ? `${cheatsheet.entries.length} ${cheatsheet.entries.length === 1 ? "entry" : "entries"} · ${cheatsheet.episodes_covered.length} session ${cheatsheet.episodes_covered.length === 1 ? "episode" : "episodes"}`
              : copyForEmpty()}
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            type="button"
            onClick={() => void onSave()}
            disabled={state.kind === "saving" || !isEdited}
            style={{
              padding: "0.4rem 0.8rem",
              fontSize: 14,
              cursor: state.kind === "saving" || !isEdited ? "not-allowed" : "pointer",
            }}
            aria-label="Save cheatsheet edits"
          >
            {state.kind === "saving" ? "Saving…" : "Save edits"}
          </button>
          <button
            type="button"
            onClick={onExport}
            disabled={state.kind === "exporting"}
            style={{
              padding: "0.4rem 0.8rem",
              fontSize: 14,
              cursor: state.kind === "exporting" ? "wait" : "pointer",
              background: "#0a7",
              color: "white",
              border: "none",
              borderRadius: 4,
            }}
            aria-label="Export cheatsheet to PDF"
          >
            Export PDF
          </button>
        </div>
      </div>

      <textarea
        value={draftMarkdown}
        onChange={(e) => setDraftMarkdown(e.target.value)}
        aria-label="Cheatsheet markdown content (editable)"
        spellCheck={false}
        style={{
          width: "100%",
          minHeight: 360,
          fontFamily: "ui-monospace, SFMono-Regular, monospace",
          fontSize: 13,
          padding: "0.75rem",
          border: "1px solid #ccc",
          borderRadius: 4,
          resize: "vertical",
        }}
      />

      <p style={{ marginTop: "0.5rem", color: "#666", fontSize: 12 }}>
        Edits are saved when you press <strong>Save edits</strong>. The PDF export uses your current
        draft.
      </p>
    </section>
  );
}
