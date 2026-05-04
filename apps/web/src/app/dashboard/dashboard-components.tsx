import * as React from "react";
import type { CSSProperties, ReactElement } from "react";

// Reference React explicitly so vitest's classic-runtime JSX transform doesn't strip the
// import. Next.js's automatic JSX runtime handles this in production; vitest does not.
void React;

// Pure-view components for the dashboard surface (STORY-022). These are deliberately
// auth-/DB-/server-state-free so the unit test in `dashboard-components.test.tsx` can render
// them with React's test renderer.
//
// EPIC-011 anti-dark-pattern stance is enforced HERE: the copy never uses urgency, shame,
// loss-aversion, or fire emoji. The `dashboard-components.test.tsx` file asserts the absence
// of "DON'T LOSE", "DAY X", "burn", and the 🔥 / ⚠️ characters — if those phrases ever sneak
// in, the test fails.

const cardBaseStyle: CSSProperties = {
  border: "1px solid #e3e3e3",
  borderRadius: 8,
  padding: "1.25rem 1.5rem",
  background: "white",
};

export interface XpCardProps {
  xp: number;
}

export function XpCard({ xp }: XpCardProps): ReactElement {
  return (
    <section data-testid="xp-card" aria-labelledby="xp-card-label" style={{ ...cardBaseStyle }}>
      <div
        id="xp-card-label"
        style={{
          fontSize: "0.85rem",
          color: "#666",
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        Lifetime XP
      </div>
      <div style={{ fontSize: "2.5rem", fontWeight: 700, marginTop: "0.25rem" }}>
        {xp.toLocaleString("en-US")}
      </div>
      <div style={{ fontSize: "0.9rem", color: "#666", marginTop: "0.25rem" }}>
        Earned across every problem you&apos;ve worked on.
      </div>
    </section>
  );
}

export interface StreakCardProps {
  streakDays: number;
  graceDaysRemaining: number;
  graceDaysUsedThisCheck: number;
  monthlyGraceCap: number;
}

// Coach-voice copy. Deliberately plain. Per EPIC-011 + STORY-022 AC #5: no "DON'T LOSE", no
// "DAY X", no "burn", no urgency emoji. A 0-day streak is a soft prompt, not shame.
export function StreakCard(props: StreakCardProps): ReactElement {
  const { streakDays, graceDaysRemaining, graceDaysUsedThisCheck, monthlyGraceCap } = props;
  const streakLabel =
    streakDays === 0
      ? "No active streak yet."
      : streakDays === 1
        ? "You've practiced 1 day in a row."
        : `You've practiced ${streakDays} days in a row.`;

  const graceLabel = `You have ${graceDaysRemaining} of ${monthlyGraceCap} grace days left this month.`;

  const recentGraceLabel =
    graceDaysUsedThisCheck > 0
      ? `Used ${graceDaysUsedThisCheck} grace ${graceDaysUsedThisCheck === 1 ? "day" : "days"} to keep your streak going.`
      : null;

  const headline = streakDays === 0 ? "Start whenever you're ready." : `${streakDays}-day streak`;

  return (
    <section
      data-testid="streak-card"
      aria-labelledby="streak-card-label"
      style={{ ...cardBaseStyle }}
    >
      <div
        id="streak-card-label"
        style={{
          fontSize: "0.85rem",
          color: "#666",
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        Streak
      </div>
      <div style={{ fontSize: "1.5rem", fontWeight: 600, marginTop: "0.25rem" }}>{headline}</div>
      <div style={{ fontSize: "0.95rem", color: "#444", marginTop: "0.5rem" }}>{streakLabel}</div>
      <div style={{ fontSize: "0.9rem", color: "#666", marginTop: "0.25rem" }}>{graceLabel}</div>
      {recentGraceLabel ? (
        <div style={{ fontSize: "0.9rem", color: "#666", marginTop: "0.25rem" }}>
          {recentGraceLabel}
        </div>
      ) : null}
    </section>
  );
}

export interface TrackProgressBarProps {
  trackName: string;
  trackSlug: string;
  language: "python" | "typescript";
  mastered: number;
  total: number;
  ratio: number; // 0..1
}

export function TrackProgressBar(props: TrackProgressBarProps): ReactElement {
  const { trackName, language, mastered, total, ratio } = props;
  const pct = Math.round(ratio * 100);
  return (
    <section
      data-testid={`track-progress-${props.trackSlug}`}
      aria-label={`Progress in ${trackName}`}
      style={{ ...cardBaseStyle, padding: "1rem 1.25rem" }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: "1rem",
        }}
      >
        <div>
          <div style={{ fontSize: "1rem", fontWeight: 600 }}>{trackName}</div>
          <div style={{ fontSize: "0.8rem", color: "#888" }}>{language}</div>
        </div>
        <div style={{ fontSize: "0.9rem", color: "#444", whiteSpace: "nowrap" }}>
          {mastered} / {total} concepts &middot; {pct}%
        </div>
      </div>
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        style={{
          marginTop: "0.6rem",
          height: 10,
          background: "#eee",
          borderRadius: 999,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: "#3a82f7",
            transition: "width 200ms ease-out",
          }}
        />
      </div>
    </section>
  );
}
