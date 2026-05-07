"use client";

import * as React from "react";
import { useCallback, useEffect, useState } from "react";

void React;

// STORY-045 — settings card for the email digest opt-ins. Three controls:
//
//   - Daily digest checkbox — opt-in for the daily recap email.
//   - Weekly digest checkbox — opt-in for the weekly recap email.
//   - Weekday picker — which day of the week to send the weekly digest on.
//
// Coach-voice copy: emphasises that emails are off by default, factual, friendly. No urgency,
// no "don't miss out". A short note about the inline unsubscribe link reassures the user this
// isn't a sticky list.

export interface EmailDigestPrefs {
  daily_opt_in: boolean;
  weekly_opt_in: boolean;
  weekly_day_of_week: number;
}

export interface EmailDigestCardProps {
  fetcher?: typeof fetch;
  loadOnMount?: boolean;
  initialPrefs?: EmailDigestPrefs;
}

const DEFAULT_PREFS: EmailDigestPrefs = {
  daily_opt_in: false,
  weekly_opt_in: false,
  weekly_day_of_week: 1,
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

const WEEKDAYS: ReadonlyArray<{ label: string; value: number }> = [
  { label: "Monday", value: 1 },
  { label: "Tuesday", value: 2 },
  { label: "Wednesday", value: 3 },
  { label: "Thursday", value: 4 },
  { label: "Friday", value: 5 },
  { label: "Saturday", value: 6 },
  { label: "Sunday", value: 7 },
];

export function EmailDigestCard(props: EmailDigestCardProps = {}): React.ReactElement {
  const fetcher = props.fetcher ?? (typeof fetch !== "undefined" ? fetch : undefined);
  const initial = props.initialPrefs ?? DEFAULT_PREFS;

  const [dailyOptIn, setDailyOptIn] = useState(initial.daily_opt_in);
  const [weeklyOptIn, setWeeklyOptIn] = useState(initial.weekly_opt_in);
  const [weeklyDay, setWeeklyDay] = useState(initial.weekly_day_of_week);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!fetcher) return;
    try {
      const res = await fetcher("/api/settings/email-digest");
      if (!res.ok) return;
      const body = (await res.json()) as EmailDigestPrefs;
      setDailyOptIn(body.daily_opt_in);
      setWeeklyOptIn(body.weekly_opt_in);
      setWeeklyDay(body.weekly_day_of_week);
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
      const res = await fetcher("/api/settings/email-digest", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          daily_opt_in: dailyOptIn,
          weekly_opt_in: weeklyOptIn,
          weekly_day_of_week: weeklyDay,
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
  }, [fetcher, dailyOptIn, weeklyOptIn, weeklyDay]);

  return (
    <section
      aria-labelledby="email-digest-heading"
      style={CARD_STYLE}
      data-testid="email-digest-card"
    >
      <div>
        <h2 id="email-digest-heading" style={{ margin: 0, fontSize: "1.05rem" }}>
          Email digests
        </h2>
        <p style={HELP_STYLE}>
          Optional summary emails that recap your recent practice. Off by default. Every email
          includes a one-click unsubscribe link, and you can flip these off at any time.
        </p>
      </div>

      <label style={ROW_STYLE}>
        <input
          type="checkbox"
          checked={dailyOptIn}
          onChange={(e) => setDailyOptIn(e.target.checked)}
          data-testid="email-daily-checkbox"
        />
        <span style={LABEL_STYLE}>Send me a daily digest</span>
      </label>
      <p style={{ ...HELP_STYLE, marginLeft: "1.75rem" }}>
        A short recap of yesterday&apos;s episodes plus today&apos;s plan, delivered around your
        preferred reminder time.
      </p>

      <label style={ROW_STYLE}>
        <input
          type="checkbox"
          checked={weeklyOptIn}
          onChange={(e) => setWeeklyOptIn(e.target.checked)}
          data-testid="email-weekly-checkbox"
        />
        <span style={LABEL_STYLE}>Send me a weekly digest</span>
      </label>
      <p style={{ ...HELP_STYLE, marginLeft: "1.75rem" }}>
        A weekly snapshot of concepts you grew, total practice time, and a suggested next step.
      </p>

      <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
        <span style={LABEL_STYLE}>Send weekly digest on</span>
        <select
          value={weeklyDay}
          disabled={!weeklyOptIn}
          data-testid="email-weekly-day"
          onChange={(e) => setWeeklyDay(Number.parseInt(e.target.value, 10))}
          style={{ maxWidth: 200 }}
        >
          {WEEKDAYS.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
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
          data-testid="email-digest-save"
        >
          {saveState === "saving" ? "Saving…" : "Save"}
        </button>
        {saveState === "saved" ? (
          <span
            data-testid="email-digest-saved-banner"
            style={{ fontSize: "0.85rem", color: "#0a7c4a" }}
          >
            Saved. Email preferences updated.
          </span>
        ) : null}
        {saveState === "error" ? (
          <span
            data-testid="email-digest-error-banner"
            style={{ fontSize: "0.85rem", color: "#9a1d1d" }}
          >
            {errorMessage ?? "Couldn't save."}
          </span>
        ) : null}
      </div>
    </section>
  );
}
