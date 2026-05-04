"use client";

import * as React from "react";
import type { SessionPlanState } from "../../lib/session-plan-state";
import { completedCount, pendingCount, totalDurationMin } from "../../lib/session-plan-state";

// Explicit React reference: vitest's classic JSX runtime emits React.createElement, so without an
// imported React in scope the test pass throws "React is not defined" inside the component body.
void React;

// SessionPlanSidebar (STORY-015) — renders the 3-5 micro-objectives as a checklist. Pending
// items show `[ ] Objective (~Nmin)`; completed items show `[x]` plus the slug of the problem
// that completed them. The "Skip plan" link hides the sidebar locally for this mount; the
// chosen-simpler-path noted in the spec.

export interface SessionPlanSidebarProps {
  state: SessionPlanState;
  onSkip: () => void;
  onRetry?: () => void;
}

export function SessionPlanSidebar({ state, onSkip, onRetry }: SessionPlanSidebarProps) {
  if (state.phase === "skipped") return null;
  return (
    <aside
      aria-label="Session plan"
      style={{
        border: "1px solid #ddd",
        borderRadius: 6,
        padding: "0.85rem 1rem",
        background: "#fafafa",
        display: "grid",
        gap: "0.5rem",
        minWidth: 240,
      }}
    >
      <Header state={state} />
      <Body state={state} onSkip={onSkip} onRetry={onRetry} />
    </aside>
  );
}

function Header({ state }: { state: SessionPlanState }) {
  if (state.phase === "ready") {
    const total = totalDurationMin(state.plan);
    return (
      <header style={{ display: "flex", alignItems: "baseline", gap: "0.6rem" }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Today&apos;s plan</h3>
        <span style={{ fontSize: 12, color: "#666" }}>
          {completedCount(state.plan)}/{state.plan.items.length} done · ~{total}min
        </span>
        {state.fallback && (
          <span
            style={{
              fontSize: 11,
              color: "#925",
              background: "#fdebed",
              borderRadius: 4,
              padding: "1px 6px",
            }}
            title="The plan agent fell back to a deterministic baseline"
          >
            fallback
          </span>
        )}
      </header>
    );
  }
  return <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Today&apos;s plan</h3>;
}

function Body({
  state,
  onSkip,
  onRetry,
}: {
  state: SessionPlanState;
  onSkip: () => void;
  onRetry?: () => void;
}) {
  if (state.phase === "loading") {
    return (
      <div aria-live="polite" style={{ display: "grid", gap: "0.4rem" }}>
        <SkeletonLine />
        <SkeletonLine />
        <SkeletonLine />
        <SkipLink onSkip={onSkip} />
      </div>
    );
  }
  if (state.phase === "empty") {
    return (
      <div style={{ display: "grid", gap: "0.4rem" }}>
        <p style={{ margin: 0, fontSize: 13, color: "#666" }}>No plan yet — pick a track above.</p>
        <SkipLink onSkip={onSkip} />
      </div>
    );
  }
  if (state.phase === "error") {
    return (
      <div style={{ display: "grid", gap: "0.4rem" }}>
        <p style={{ margin: 0, fontSize: 13, color: "#a33" }}>{state.message}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            style={{
              padding: "0.25rem 0.6rem",
              background: "#eee",
              border: "1px solid #ccc",
              borderRadius: 4,
              cursor: "pointer",
              fontSize: 13,
              alignSelf: "flex-start",
            }}
          >
            Retry
          </button>
        )}
        <SkipLink onSkip={onSkip} />
      </div>
    );
  }
  if (state.phase === "ready") {
    const items = state.plan.items;
    const remainingPending = pendingCount(state.plan);
    return (
      <div>
        <ol
          style={{
            margin: 0,
            padding: 0,
            listStyle: "none",
            display: "grid",
            gap: "0.35rem",
          }}
        >
          {items.map((it) => (
            <PlanItemRow
              key={it.slug}
              slug={it.slug}
              objective={it.objective}
              minutes={it.estimated_duration_min}
              completed={it.status === "completed"}
              completedSlug={it.status === "completed" ? (it.episode_id ? it.slug : null) : null}
            />
          ))}
        </ol>
        {remainingPending > 0 && <SkipLink onSkip={onSkip} />}
      </div>
    );
  }
  // skipped is filtered above; exhaustive switch.
  return null;
}

function PlanItemRow({
  slug,
  objective,
  minutes,
  completed,
  completedSlug,
}: {
  slug: string;
  objective: string;
  minutes: number;
  completed: boolean;
  completedSlug: string | null;
}) {
  const checkbox = completed ? "[x]" : "[ ]";
  const tail = completed ? (completedSlug ? ` — ${completedSlug}` : "") : ` (~${minutes}min)`;
  return (
    <li
      data-slug={slug}
      data-status={completed ? "completed" : "pending"}
      style={{
        fontSize: 13,
        lineHeight: 1.4,
        color: completed ? "#666" : "#222",
        textDecoration: completed ? "line-through" : "none",
      }}
    >
      <span style={{ fontFamily: "monospace", marginRight: 6 }}>{checkbox}</span>
      <span>
        {objective}
        {tail}
      </span>
    </li>
  );
}

function SkeletonLine() {
  return (
    <div
      aria-hidden="true"
      style={{
        height: 14,
        background: "linear-gradient(90deg, #eee 0%, #f6f6f6 50%, #eee 100%)",
        borderRadius: 4,
      }}
    />
  );
}

function SkipLink({ onSkip }: { onSkip: () => void }) {
  return (
    <button
      type="button"
      onClick={onSkip}
      style={{
        background: "none",
        border: "none",
        padding: 0,
        color: "#1976d2",
        cursor: "pointer",
        fontSize: 12,
        textDecoration: "underline",
        alignSelf: "flex-start",
      }}
    >
      Skip plan
    </button>
  );
}
