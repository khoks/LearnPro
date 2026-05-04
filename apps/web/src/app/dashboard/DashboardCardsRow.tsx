"use client";

import * as React from "react";
import { useViewportSize } from "../../lib/use-viewport-size";
import { StreakCard, XpCard } from "./dashboard-components";

void React;

// STORY-025 — XP + Streak cards stack on a single column below the mobile breakpoint
// (<768px) and sit side-by-side at tablet/laptop widths. Two cards by name only — the spec's
// "3-card grid" rolls in TrackProgressBar below, which is its own vertical list and already
// stacks gracefully on every width.

export interface DashboardCardsRowProps {
  xp: number;
  streakDays: number;
  graceDaysRemaining: number;
  graceDaysUsedThisCheck: number;
  monthlyGraceCap: number;
}

export function DashboardCardsRow(props: DashboardCardsRowProps): React.ReactElement {
  const { breakpoint } = useViewportSize();
  const columns = breakpoint === "mobile" ? "1fr" : "1fr 1fr";
  return (
    <section
      aria-label="Your progress"
      data-testid="dashboard-cards-row"
      data-breakpoint={breakpoint}
      style={{ display: "grid", gridTemplateColumns: columns, gap: "1rem" }}
    >
      <XpCard xp={props.xp} />
      <StreakCard
        streakDays={props.streakDays}
        graceDaysRemaining={props.graceDaysRemaining}
        graceDaysUsedThisCheck={props.graceDaysUsedThisCheck}
        monthlyGraceCap={props.monthlyGraceCap}
      />
    </section>
  );
}
