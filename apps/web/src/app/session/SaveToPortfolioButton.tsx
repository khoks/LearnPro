"use client";

import * as React from "react";
import { useCallback, useEffect, useState } from "react";

void React;

// STORY-040 — "Save to portfolio" button + modal that appears next to SkillUpdateSummary
// when an episode finishes with a passing outcome AND the user has connected their portfolio.
// Pre-fills the README from /api/portfolio/state (just the connected check + repo) and lets
// the user edit before posting.

const PASSING_OUTCOMES = new Set(["passed", "passed_with_hints"]);

export interface SaveToPortfolioButtonProps {
  episodeId: string;
  finalOutcome: string;
  // Override fetch / window.location for tests.
  fetcher?: typeof fetch;
  // Override the connected-state check (skip the GET on first render). Used by tests.
  initialConnected?: boolean;
}

interface PushSuccess {
  html_url: string;
  directory_path: string;
}

export function SaveToPortfolioButton(
  props: SaveToPortfolioButtonProps,
): React.ReactElement | null {
  const fetcher = props.fetcher ?? (typeof fetch !== "undefined" ? fetch : undefined);
  const [connected, setConnected] = useState<boolean | null>(props.initialConnected ?? null);
  const [open, setOpen] = useState(false);
  const [readme, setReadme] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<PushSuccess | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isPassing = PASSING_OUTCOMES.has(props.finalOutcome);

  useEffect(() => {
    if (props.initialConnected !== undefined) return;
    if (!fetcher) return;
    if (!isPassing) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetcher("/api/portfolio/state");
        if (!res.ok) {
          if (!cancelled) setConnected(false);
          return;
        }
        const body = (await res.json()) as { connected: boolean };
        if (!cancelled) setConnected(!!body.connected);
      } catch {
        if (!cancelled) setConnected(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetcher, props.initialConnected, isPassing]);

  // We don't have the rendered README content at the client; the API generates it server-side
  // from the episode's most-recent submission. So when the modal opens, we kick off a "preview"
  // by sending an empty edit_readme — but actually that would push. Instead, the modal shows
  // a stub textarea the user can fill in, and we hit the API only on Save. Keeping it simple
  // wins here: most users will accept the auto-generated default by leaving the field empty.
  const onOpen = useCallback(() => {
    setOpen(true);
    setError(null);
    setSuccess(null);
    setReadme("");
  }, []);

  const onClose = useCallback(() => {
    setOpen(false);
  }, []);

  const onSave = useCallback(async () => {
    if (!fetcher) return;
    setSubmitting(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { episode_id: props.episodeId };
      if (readme.trim().length > 0) body["edit_readme"] = readme;
      const res = await fetcher("/api/portfolio/push", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as {
          error?: string;
          message?: string;
        };
        setError(
          errBody.message ??
            errBody.error ??
            `Save failed (HTTP ${res.status}). Try again in a moment.`,
        );
        setSubmitting(false);
        return;
      }
      const ok = (await res.json()) as PushSuccess;
      setSuccess(ok);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }, [fetcher, props.episodeId, readme]);

  if (!isPassing) return null;
  if (connected !== true) return null;

  return (
    <>
      <button
        type="button"
        onClick={onOpen}
        data-testid="save-to-portfolio-button"
        style={{
          padding: "0.45rem 0.9rem",
          background: "#3a82f7",
          color: "white",
          border: "none",
          borderRadius: 4,
          fontWeight: 600,
          cursor: "pointer",
          alignSelf: "flex-start",
        }}
      >
        Save to portfolio
      </button>

      {open ? (
        <div
          role="dialog"
          aria-labelledby="save-to-portfolio-heading"
          aria-modal="true"
          data-testid="save-to-portfolio-modal"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
          }}
        >
          <div
            style={{
              background: "white",
              padding: "1.5rem",
              borderRadius: 8,
              maxWidth: 640,
              width: "calc(100% - 2rem)",
              display: "flex",
              flexDirection: "column",
              gap: "0.75rem",
            }}
          >
            <h2 id="save-to-portfolio-heading" style={{ margin: 0 }}>
              Save to portfolio
            </h2>
            <p style={{ margin: 0, fontSize: "0.9rem", color: "#555" }}>
              We&apos;ll commit a README plus your solution to your portfolio repo. Edit the
              README below, or leave it blank to use the default template.
            </p>
            <textarea
              data-testid="save-to-portfolio-readme"
              value={readme}
              onChange={(e) => setReadme(e.target.value)}
              placeholder="Optional — leave empty to use the auto-generated README"
              rows={10}
              style={{
                fontFamily: "ui-monospace, monospace",
                fontSize: "0.85rem",
                padding: "0.5rem",
                border: "1px solid #ccc",
                borderRadius: 4,
                width: "100%",
                resize: "vertical",
              }}
            />
            {success ? (
              <div
                role="status"
                data-testid="save-to-portfolio-success"
                style={{ fontSize: "0.9rem", color: "#0a7c4a" }}
              >
                Saved.{" "}
                <a
                  href={success.html_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="save-to-portfolio-success-link"
                >
                  View on GitHub
                </a>
                .
              </div>
            ) : null}
            {error ? (
              <div
                role="alert"
                data-testid="save-to-portfolio-error"
                style={{ fontSize: "0.9rem", color: "#9a1d1d" }}
              >
                {error}
              </div>
            ) : null}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                style={{
                  padding: "0.45rem 0.9rem",
                  background: "#f3f4f6",
                  border: "1px solid #ccc",
                  borderRadius: 4,
                  cursor: "pointer",
                }}
              >
                Close
              </button>
              {success ? null : (
                <button
                  type="button"
                  onClick={onSave}
                  disabled={submitting}
                  data-testid="save-to-portfolio-submit"
                  style={{
                    padding: "0.45rem 0.9rem",
                    background: "#3a82f7",
                    color: "white",
                    border: "none",
                    borderRadius: 4,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {submitting ? "Saving…" : "Save"}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
