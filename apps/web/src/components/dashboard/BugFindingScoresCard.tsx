import * as React from "react";
import type { CSSProperties, ReactElement } from "react";
import type { BugArchetypeKey } from "@learnpro/scoring";
import {
  bugFindingBand,
  humanizeBugArchetype,
  type BugFindingBand,
} from "../../lib/bug-finding-band.js";

void React;

// STORY-037b — coach-voice surface for the per-archetype bug-finding EWMA persisted by
// STORY-037a. Anti-dark-pattern stance enforced HERE: the score is reframed as growth, not
// deficit. Never a raw number. Never a percentile. Never "weakness" or "gap" framing. The
// `BugFindingScoresCard.test.tsx` forbidden-phrase test asserts the card never renders any of
// those.

export interface BugFindingScoreRow {
  bug_archetype: BugArchetypeKey;
  score: number;
  attempts: number;
  // `confidence` is stored by the API but not surfaced — the band already softens the EWMA.
  confidence?: number;
}

export interface BugFindingScoresCardProps {
  // Pre-fetched rows from `GET /api/bug-finding-scores`. Empty array (or all-zero attempts)
  // → empty state copy.
  scores: ReadonlyArray<BugFindingScoreRow>;
}

const cardBaseStyle: CSSProperties = {
  border: "1px solid #e3e3e3",
  borderRadius: 8,
  padding: "1.25rem 1.5rem",
  background: "white",
};

const BAND_COPY: Record<BugFindingBand, { label: string; color: string; bg: string }> = {
  // Coach-voice: every band is framed as a stage on a growth path, not a verdict.
  "still learning": { label: "Still learning", color: "#7a4c00", bg: "#fff3df" },
  "getting there": { label: "Getting there", color: "#1f4a8c", bg: "#dde9fb" },
  solid: { label: "Solid", color: "#0a5d36", bg: "#dbf2e3" },
};

// Sort: highest-attempts first (most-touched archetypes first); ties broken by humanized label.
function sortRows(rows: ReadonlyArray<BugFindingScoreRow>): ReadonlyArray<BugFindingScoreRow> {
  return [...rows].sort((a, b) => {
    if (b.attempts !== a.attempts) return b.attempts - a.attempts;
    return humanizeBugArchetype(a.bug_archetype).localeCompare(
      humanizeBugArchetype(b.bug_archetype),
    );
  });
}

export function BugFindingScoresCard(props: BugFindingScoresCardProps): ReactElement {
  const { scores } = props;
  // Empty state: no rows at all OR every row has 0 attempts (cold-start uniform prior). Both
  // mean "the user hasn't actually tried a debug problem yet" — render the soft prompt.
  const hasAnyAttempts = scores.some((s) => s.attempts > 0);

  return (
    <section
      data-testid="bug-finding-scores-card"
      aria-labelledby="bug-finding-scores-card-label"
      style={{ ...cardBaseStyle }}
    >
      <div
        id="bug-finding-scores-card-label"
        style={{
          fontSize: "0.85rem",
          color: "#666",
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        Bug-finding
      </div>
      <div style={{ fontSize: "1.05rem", fontWeight: 600, marginTop: "0.35rem" }}>
        Bug archetypes you&apos;ve worked through
      </div>
      {!hasAnyAttempts ? (
        <div
          data-testid="bug-finding-scores-card-empty"
          style={{ fontSize: "0.95rem", color: "#444", marginTop: "0.6rem", lineHeight: 1.45 }}
        >
          Try a debug problem to see your bug-finding scores here.
        </div>
      ) : (
        <ul
          data-testid="bug-finding-scores-card-list"
          style={{
            margin: "0.6rem 0 0",
            padding: 0,
            listStyle: "none",
            display: "grid",
            gap: "0.4rem",
          }}
        >
          {sortRows(scores)
            .filter((row) => row.attempts > 0)
            .map((row) => {
              const band = bugFindingBand(row.score);
              const bandCopy = BAND_COPY[band];
              const attemptsLabel = row.attempts === 1 ? "1 attempt" : `${row.attempts} attempts`;
              return (
                <li
                  key={row.bug_archetype}
                  data-testid={`bug-finding-row-${row.bug_archetype}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto auto",
                    alignItems: "center",
                    gap: "0.6rem",
                    padding: "0.45rem 0.6rem",
                    borderRadius: 6,
                    background: "#fafafa",
                    border: "1px solid #eee",
                  }}
                >
                  <span style={{ fontSize: "0.95rem", color: "#222" }}>
                    {humanizeBugArchetype(row.bug_archetype)}
                  </span>
                  <span
                    data-testid={`bug-finding-band-${row.bug_archetype}`}
                    aria-label={`${humanizeBugArchetype(row.bug_archetype)} — ${bandCopy.label}`}
                    style={{
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      color: bandCopy.color,
                      background: bandCopy.bg,
                      padding: "0.2rem 0.55rem",
                      borderRadius: 999,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {bandCopy.label}
                  </span>
                  <span
                    style={{
                      fontSize: "0.85rem",
                      color: "#666",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {attemptsLabel}
                  </span>
                </li>
              );
            })}
        </ul>
      )}
    </section>
  );
}
