"use client";

import * as React from "react";
import { useCallback, useEffect } from "react";
import type { PasteContext } from "./paste-detect";

// Reference React explicitly so vitest's classic-runtime JSX transform doesn't strip the import.
void React;

// STORY-042 — paste-detect modal. Triggered by the editor's onPaste handler when
// `shouldTriggerPasteModal` says the paste is "substantial" (>20 chars or >30% of editor content).
//
// Coach-voice copy: never accusatory, never loss-aversion shouting, never urgency emoji.
// Two clear options:
//   - "My code"     → default; closes the modal silently. The paste was theirs.
//   - "I got help"  → flips the per-episode `got_help` flag via the parent's onGotHelp callback.
//
// Behavior:
//   - Non-blocking — the modal is a floating overlay, not a modal lock. The user can keep editing
//     behind it. ESC dismisses (treated like "My code").
//   - Single occurrence per paste — enforced by the parent: the parent only sets `paste` when a
//     fresh paste lands, and clears it on any close action.
//   - aria-modal=true + role=dialog so screen readers announce it; aria-labelledby points at the
//     headline so the SR reads the gist.

export interface PasteDetectModalProps {
  paste: PasteContext | null;
  onMyCode: () => void;
  onGotHelp: () => void;
}

export function PasteDetectModal(props: PasteDetectModalProps): React.ReactElement | null {
  const { paste, onMyCode, onGotHelp } = props;

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (paste === null) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onMyCode();
      }
    },
    [paste, onMyCode],
  );

  useEffect(() => {
    if (paste === null) return;
    if (typeof window === "undefined") return;
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [paste, onKeyDown]);

  if (paste === null) return null;

  const previewLines = paste.preview.split("\n").slice(0, 6);
  const truncated =
    paste.preview.length < paste.text.length || paste.preview.split("\n").length > 6;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="paste-detect-modal-headline"
      data-testid="paste-detect-modal"
      style={{
        position: "fixed",
        right: 24,
        bottom: 24,
        zIndex: 50,
        maxWidth: 380,
        background: "white",
        border: "1px solid #cfd8dc",
        borderRadius: 8,
        boxShadow: "0 10px 30px rgba(0,0,0,0.18)",
        padding: "0.9rem 1rem",
        display: "grid",
        gap: "0.6rem",
      }}
    >
      <div
        id="paste-detect-modal-headline"
        style={{ fontWeight: 700, fontSize: 15, color: "#1f2d3d" }}
      >
        Looks like you pasted some code.
      </div>
      <p style={{ margin: 0, fontSize: 13, color: "#37474f", lineHeight: 1.45 }}>
        Was this yours, or do you want to mark it as &ldquo;got help&rdquo;? Your choice keeps your
        adaptiveness sharper — there&apos;s no penalty either way.
      </p>
      <pre
        data-testid="paste-detect-modal-preview"
        style={{
          margin: 0,
          padding: "0.5rem 0.6rem",
          background: "#f5f7fa",
          border: "1px solid #e0e6ed",
          borderRadius: 4,
          fontSize: 12,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          color: "#37474f",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          maxHeight: 120,
          overflow: "auto",
        }}
      >
        {previewLines.join("\n")}
        {truncated ? "\n…" : ""}
      </pre>
      <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={onGotHelp}
          data-testid="paste-detect-modal-got-help"
          style={{
            padding: "0.4rem 0.8rem",
            background: "transparent",
            border: "1px solid #90a4ae",
            color: "#37474f",
            borderRadius: 4,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          I got help
        </button>
        <button
          type="button"
          onClick={onMyCode}
          autoFocus
          data-testid="paste-detect-modal-my-code"
          style={{
            padding: "0.4rem 0.9rem",
            background: "#0a7",
            border: "none",
            color: "white",
            borderRadius: 4,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          My code
        </button>
      </div>
    </div>
  );
}
