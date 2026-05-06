import * as React from "react";
import Link from "next/link";

// Reference React explicitly so vitest's classic-runtime JSX transform doesn't strip the
// import. Next.js's automatic JSX runtime handles this in production; vitest does not — same
// shim used by `dashboard-components.tsx` and `DashboardHeader.tsx`.
void React;

// STORY-021 — pure presentation component for the /recommended page. Extracted so it can be
// unit-tested in jsdom without spinning up a Next.js render. The page (page.tsx) does the auth +
// API fetch + redirect-on-null work; this component only knows how to render a hydrated payload.
//
// Free choice, no soft-locks (AC #3): the dashboard link is always present, equally prominent.
// The track cards are suggestions, not gates.

export type RoleBias = "standard" | "math-heavy" | "gentle-onramp";

export interface RecommendedTrackSummary {
  slug: string;
  name: string;
  language: "python" | "typescript";
  description: string | null;
}

export interface RecommendedTracksCardProps {
  roleLabel: string;
  bias: RoleBias;
  recommendedDailyMinutes: number;
  tracks: RecommendedTrackSummary[];
  // Where the "Take me to the dashboard" link points. Externalised for tests + future i18n.
  dashboardHref?: string;
}

// One-line, coach-voice copy for each bias. Forbidden-phrase test (RecommendedTracksCard.test.tsx)
// asserts none of these contain shaming or pressure language ("must", "have to", "can't", etc.).
const BIAS_HINTS: Record<RoleBias, string> = {
  standard: "We will start with the core skills your role uses every day.",
  "math-heavy": "Expect a few extra reps on math-shaped problems — useful for ML work.",
  "gentle-onramp": "Short sessions, friendly pace. Build the habit first, speed later.",
};

export function RecommendedTracksCard(props: RecommendedTracksCardProps): React.ReactElement {
  const dashboardHref = props.dashboardHref ?? "/dashboard";
  return (
    <section
      data-testid="recommended-tracks-card"
      style={{
        display: "grid",
        gap: "1.25rem",
      }}
    >
      <header style={{ display: "grid", gap: "0.4rem" }}>
        <h1 style={{ fontSize: "1.5rem", margin: 0 }}>Welcome — here is what we recommend</h1>
        <p style={{ margin: 0, color: "#444" }}>
          Based on your goal (
          <strong data-testid="recommended-role-label">{props.roleLabel}</strong>), these tracks fit
          best. About <strong>{props.recommendedDailyMinutes} minutes a day</strong> is a good
          rhythm.
        </p>
        <p style={{ margin: 0, color: "#666", fontStyle: "italic" }}>{BIAS_HINTS[props.bias]}</p>
      </header>

      <div role="list" aria-label="Recommended tracks" style={{ display: "grid", gap: "0.75rem" }}>
        {props.tracks.map((t) => (
          <TrackCard key={t.slug} track={t} />
        ))}
      </div>

      <p style={{ margin: 0, color: "#666", fontSize: 14 }}>
        Want to look around first? Each suggestion is just that — a suggestion.
      </p>

      <Link
        href={dashboardHref}
        data-testid="dashboard-fallback-link"
        style={{
          display: "inline-block",
          color: "#0066cc",
          textDecoration: "underline",
          fontSize: 15,
          width: "fit-content",
        }}
      >
        Take me to the dashboard
      </Link>
    </section>
  );
}

function TrackCard({ track }: { track: RecommendedTrackSummary }): React.ReactElement {
  return (
    <Link
      role="listitem"
      data-testid={`recommended-track-${track.slug}`}
      href={`/session?track=${encodeURIComponent(track.slug)}`}
      style={{
        display: "block",
        padding: "0.85rem 1rem",
        border: "1px solid #ddd",
        borderRadius: 6,
        background: "#fff",
        color: "#222",
        textDecoration: "none",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <strong style={{ fontSize: 16 }}>{track.name}</strong>
        <span
          aria-label={`Language: ${track.language}`}
          style={{ fontSize: 12, color: "#666", textTransform: "uppercase" }}
        >
          {track.language}
        </span>
      </div>
      {track.description ? (
        <p style={{ margin: "0.4rem 0 0", color: "#444", fontSize: 14 }}>{track.description}</p>
      ) : null}
    </Link>
  );
}
