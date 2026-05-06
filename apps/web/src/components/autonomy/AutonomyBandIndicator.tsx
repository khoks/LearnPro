"use client";

import * as React from "react";
import { useCallback, useEffect, useState } from "react";

void React;

// STORY-054 — coach-voice indicator on the dashboard showing the user's current autonomy band.
// Copy reinforces partnership, never deficit: "while it learns your style" reads as a settling-in
// phase, not "you're a beginner". Forbidden phrases (validated by test): "miss reminders",
// "lose your streak", "remedial", "struggle".

export type AutonomyBand = "low" | "medium" | "high";

export interface AutonomyState {
  band: AutonomyBand;
  signal: unknown;
  episode_count: number;
  cold_start_threshold: number;
  combined_score: number;
}

export interface AutonomyBandIndicatorProps {
  fetcher?: typeof fetch;
  loadOnMount?: boolean;
  initialState?: AutonomyState;
}

const CARD_STYLE: React.CSSProperties = {
  border: "1px solid #ddd",
  borderRadius: 8,
  padding: "0.85rem 1rem",
  background: "white",
  display: "inline-flex",
  alignItems: "center",
  gap: "0.6rem",
  position: "relative",
};

const BAND_DOT_STYLE: React.CSSProperties = {
  width: 12,
  height: 12,
  borderRadius: "50%",
};

const BAND_COLORS: Record<AutonomyBand, string> = {
  low: "#7a8aa1",
  medium: "#3a82f7",
  high: "#0a7c4a",
};

const BAND_LABELS: Record<AutonomyBand, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

// Coach-voice tooltip copy. Keep partnership-positive — see DIFFERENTIATORS.md.
const BAND_TOOLTIPS: Record<AutonomyBand, string> = {
  low: "LearnPro is asking you to confirm most actions while it learns your style.",
  medium: "LearnPro handles the routine moves on its own and checks in on the bigger ones.",
  high: "LearnPro keeps things moving. It will pause to check in only on big shifts like switching tracks.",
};

export function AutonomyBandIndicator(props: AutonomyBandIndicatorProps = {}): React.ReactElement {
  const fetcher = props.fetcher ?? (typeof fetch !== "undefined" ? fetch : undefined);
  const [state, setState] = useState<AutonomyState | null>(props.initialState ?? null);
  const [tooltipVisible, setTooltipVisible] = useState(false);

  const refresh = useCallback(async () => {
    if (!fetcher) return;
    try {
      const res = await fetcher("/api/autonomy/state");
      if (!res.ok) return;
      const body = (await res.json()) as AutonomyState;
      setState(body);
    } catch {
      // soft-fail: leave the rendered state alone
    }
  }, [fetcher]);

  useEffect(() => {
    if (props.loadOnMount === false) return;
    void refresh();
  }, [refresh, props.loadOnMount]);

  if (!state) {
    return (
      <div
        data-testid="autonomy-band-indicator-loading"
        style={{ ...CARD_STYLE, color: "#666", fontSize: "0.9rem" }}
      >
        <span>Loading tutor autonomy…</span>
      </div>
    );
  }

  const tooltipId = "autonomy-band-tooltip";

  return (
    <div data-testid="autonomy-band-indicator" style={CARD_STYLE} role="status" aria-live="polite">
      <span aria-hidden="true" style={{ ...BAND_DOT_STYLE, background: BAND_COLORS[state.band] }} />
      <span style={{ fontSize: "0.85rem", color: "#444" }}>Tutor autonomy:</span>
      <strong style={{ fontSize: "0.95rem" }}>{BAND_LABELS[state.band]}</strong>
      <button
        type="button"
        aria-label="Why this autonomy band?"
        aria-describedby={tooltipVisible ? tooltipId : undefined}
        onMouseEnter={() => setTooltipVisible(true)}
        onMouseLeave={() => setTooltipVisible(false)}
        onFocus={() => setTooltipVisible(true)}
        onBlur={() => setTooltipVisible(false)}
        data-testid="autonomy-band-tooltip-trigger"
        style={{
          background: "transparent",
          border: "1px solid #ccc",
          borderRadius: "50%",
          width: 20,
          height: 20,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "help",
          fontSize: "0.7rem",
          color: "#555",
          padding: 0,
        }}
      >
        ?
      </button>
      {tooltipVisible ? (
        <div
          id={tooltipId}
          role="tooltip"
          data-testid="autonomy-band-tooltip"
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: "0.35rem",
            padding: "0.6rem 0.8rem",
            background: "#222",
            color: "white",
            borderRadius: 6,
            fontSize: "0.8rem",
            lineHeight: 1.4,
            maxWidth: 280,
            zIndex: 10,
          }}
        >
          {BAND_TOOLTIPS[state.band]}
        </div>
      ) : null}
    </div>
  );
}
