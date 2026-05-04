"use client";

import * as React from "react";
import Link from "next/link";
import { NotificationBell } from "../../components/header/NotificationBell";
import { useViewportSize } from "../../lib/use-viewport-size";

void React;

// STORY-025 — header row stacks below 768 so the "Start a session" CTA doesn't get squeezed
// off-screen next to the bell + email. The bell stays visible on every breakpoint (it's a
// small icon button, ~36px wide).

export interface DashboardHeaderProps {
  email: string | null | undefined;
  sessionHref: string;
}

export function DashboardHeader(props: DashboardHeaderProps): React.ReactElement {
  const { breakpoint } = useViewportSize();
  const isMobile = breakpoint === "mobile";
  return (
    <header
      data-testid="dashboard-header"
      data-breakpoint={breakpoint}
      style={{
        display: "flex",
        flexDirection: isMobile ? "column" : "row",
        alignItems: isMobile ? "flex-start" : "center",
        justifyContent: "space-between",
        gap: "1rem",
        marginBottom: "2rem",
      }}
    >
      <div>
        <h1 style={{ margin: 0 }}>Dashboard</h1>
        <p style={{ margin: "0.25rem 0 0", color: "#666" }}>
          {props.email ? `Welcome back, ${props.email}.` : "Welcome back."}
        </p>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <NotificationBell />
        <Link
          href={props.sessionHref}
          style={{
            display: "inline-block",
            padding: "0.6rem 1.1rem",
            background: "#3a82f7",
            color: "white",
            borderRadius: 6,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Start a session
        </Link>
      </div>
    </header>
  );
}
