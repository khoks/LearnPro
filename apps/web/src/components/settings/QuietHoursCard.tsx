"use client";

import * as React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DEFAULT_QUIET_HOURS_CONFIG, type QuietHoursConfig } from "@learnpro/scoring";

void React;

// STORY-024 — settings card for the user's quiet-hours config. Coach-voice copy: we frame the
// window as "down time" the user wants for themselves, not as something we'd otherwise inflict.
// Crucially: we never say "miss reminders" or "lose your streak"; notifications inside the window
// are deferred to the moment the window closes.

export interface QuietHoursCardProps {
  // Override fetch for tests / Storybook. Defaults to the real Next.js proxies.
  fetcher?: typeof fetch;
  // Skip the initial GET so tests can render with a fixed initial state.
  loadOnMount?: boolean;
  // Initial config the form renders with. Defaults to the policy's documented default.
  initialConfig?: QuietHoursConfig;
}

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
  alignItems: "center",
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

type SaveState = "idle" | "saving" | "saved" | "error";

function minutesToTimeString(min: number): string {
  const hh = Math.floor(min / 60)
    .toString()
    .padStart(2, "0");
  const mm = (min % 60).toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

function timeStringToMinutes(s: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const hh = Number.parseInt(m[1] ?? "0", 10);
  const mm = Number.parseInt(m[2] ?? "0", 10);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function supportedTimezones(): string[] {
  // Some older runtimes / SSR don't have `Intl.supportedValuesOf`. Fall back to a tiny safe list
  // so the dropdown still renders (with the most-common picks).
  const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
  if (typeof intl.supportedValuesOf === "function") {
    try {
      return intl.supportedValuesOf("timeZone");
    } catch {
      // fall through
    }
  }
  return [
    "UTC",
    "America/Los_Angeles",
    "America/New_York",
    "America/Chicago",
    "Europe/London",
    "Europe/Berlin",
    "Asia/Tokyo",
    "Asia/Kolkata",
    "Australia/Sydney",
  ];
}

export function QuietHoursCard(props: QuietHoursCardProps = {}): React.ReactElement {
  const fetcher = props.fetcher ?? (typeof fetch !== "undefined" ? fetch : undefined);
  const initial = props.initialConfig ?? DEFAULT_QUIET_HOURS_CONFIG;

  const [enabled, setEnabled] = useState(initial.enabled);
  const [startMin, setStartMin] = useState(initial.start_min);
  const [endMin, setEndMin] = useState(initial.end_min);
  const [timezone, setTimezone] = useState(initial.timezone);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const zones = useMemo(() => supportedTimezones(), []);

  const refresh = useCallback(async () => {
    if (!fetcher) return;
    try {
      const res = await fetcher("/api/settings/quiet-hours");
      if (!res.ok) return;
      const body = (await res.json()) as QuietHoursConfig;
      setEnabled(body.enabled);
      setStartMin(body.start_min);
      setEndMin(body.end_min);
      setTimezone(body.timezone || browserTimezone());
    } catch {
      // soft-fail: stay on the rendered defaults
    }
  }, [fetcher]);

  useEffect(() => {
    if (props.loadOnMount === false) return;
    if (!props.initialConfig && (!timezone || timezone === "UTC")) {
      // If the parent didn't supply an initial config, prefer the browser's detected zone over UTC.
      setTimezone(browserTimezone());
    }
    void refresh();
    // We intentionally exclude `timezone` from deps — we only want the once-on-mount detection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh, props.loadOnMount]);

  const onSave = useCallback(async () => {
    if (!fetcher) return;
    setSaveState("saving");
    setErrorMessage(null);
    try {
      const res = await fetcher("/api/settings/quiet-hours", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          enabled,
          start_min: startMin,
          end_min: endMin,
          timezone,
        }),
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
  }, [fetcher, enabled, startMin, endMin, timezone]);

  return (
    <section
      aria-labelledby="quiet-hours-heading"
      style={CARD_STYLE}
      data-testid="quiet-hours-card"
    >
      <div>
        <h2 id="quiet-hours-heading" style={{ margin: 0, fontSize: "1.05rem" }}>
          Quiet hours
        </h2>
        <p style={HELP_STYLE}>
          Pick a window when you&apos;d rather not get notified. Anything sent during quiet hours
          waits until the window ends — your reminders aren&apos;t skipped, just held.
        </p>
      </div>

      <label style={ROW_STYLE}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          data-testid="quiet-hours-enabled"
        />
        <span style={LABEL_STYLE}>Hold notifications during quiet hours</span>
      </label>

      <div style={ROW_STYLE}>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          <span style={LABEL_STYLE}>From</span>
          <input
            type="time"
            value={minutesToTimeString(startMin)}
            disabled={!enabled}
            data-testid="quiet-hours-start"
            onChange={(e) => {
              const m = timeStringToMinutes(e.target.value);
              if (m !== null) setStartMin(m);
            }}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          <span style={LABEL_STYLE}>Until</span>
          <input
            type="time"
            value={minutesToTimeString(endMin)}
            disabled={!enabled}
            data-testid="quiet-hours-end"
            onChange={(e) => {
              const m = timeStringToMinutes(e.target.value);
              if (m !== null) setEndMin(m);
            }}
          />
        </label>
      </div>

      <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
        <span style={LABEL_STYLE}>Timezone</span>
        <select
          value={timezone}
          disabled={!enabled}
          data-testid="quiet-hours-timezone"
          onChange={(e) => setTimezone(e.target.value)}
          style={{ maxWidth: 320 }}
        >
          {zones.map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </select>
      </label>

      <div style={ROW_STYLE}>
        <button
          type="button"
          style={BUTTON_STYLE}
          disabled={saveState === "saving"}
          onClick={onSave}
          data-testid="quiet-hours-save"
        >
          {saveState === "saving" ? "Saving…" : "Save"}
        </button>
        {saveState === "saved" ? (
          <span
            data-testid="quiet-hours-saved-banner"
            style={{ fontSize: "0.85rem", color: "#0a7c4a" }}
          >
            Saved. Quiet hours updated.
          </span>
        ) : null}
        {saveState === "error" ? (
          <span
            data-testid="quiet-hours-error-banner"
            style={{ fontSize: "0.85rem", color: "#9a1d1d" }}
          >
            {errorMessage ?? "Couldn't save."}
          </span>
        ) : null}
      </div>
    </section>
  );
}
