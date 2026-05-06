import * as React from "react";
import type { CSSProperties, ReactElement } from "react";

// Reference React explicitly so vitest's classic-runtime JSX transform doesn't strip the
// import. (Without this, esbuild's classic JSX transform emits React.createElement calls and
// fails with `ReferenceError: React is not defined` at test-run time.)
void React;

// STORY-046 — pure-view components for the daily plan page (`/plan`) AND the dashboard summary
// card (compact view + "View full plan" link). Auth-/DB-/server-state-free so the unit tests
// in `plan-view.test.tsx` can render them with React's test renderer.
//
// Coach-voice copy. Anti-dark-pattern: never urgency, shame, FOMO, fire/warning emoji.
//
// Weekly plans intentionally NOT rendered. The "This week" section shows a stub explaining the
// deferral to STORY-046b (post-STORY-032 knowledge graph). We do NOT fake the weekly view.

const cardBaseStyle: CSSProperties = {
  border: "1px solid #e3e3e3",
  borderRadius: 8,
  padding: "1.25rem 1.5rem",
  background: "white",
};

export interface TodayPlanReviewItem {
  concept_id: string;
  due: string;
  days_overdue: number;
  reasoning: string;
}

export interface TodayPlanSessionItem {
  slug: string;
  objective: string;
  estimated_duration_min: number;
  status: "pending" | "completed";
  reasoning: string;
}

export interface TodayPlanShape {
  date: string;
  review_items: TodayPlanReviewItem[];
  session_plan_items: TodayPlanSessionItem[];
  episodes_today_count: number;
  session_plan_id: string | null;
  dampening: { suppressed_replan_reason?: string };
}

export interface TodayPlanSummaryCardProps {
  // null when the user has no active session plan and no due reviews.
  plan: TodayPlanShape | null;
  // Active track slug for the "Start a session" CTA. When null, the CTA still renders but
  // links to /session without a track parameter.
  activeTrackSlug: string | null;
}

// Compact dashboard surface — totals + "View full plan" deep link. Renders even on empty state
// (it gives users a clear entry point to /plan). Anti-dark-pattern stance: empty state is
// inviting, not coercive ("Plan a quick session" — no urgency, no shame).
export function TodayPlanSummaryCard(props: TodayPlanSummaryCardProps): ReactElement {
  const { plan, activeTrackSlug } = props;
  const reviewCount = plan?.review_items.length ?? 0;
  const sessionItemsRemaining =
    plan?.session_plan_items.filter((i) => i.status === "pending").length ?? 0;
  const sessionItemsTotal = plan?.session_plan_items.length ?? 0;
  const sessionHref = activeTrackSlug
    ? `/session?track=${encodeURIComponent(activeTrackSlug)}`
    : "/session";

  const headline =
    reviewCount === 0 && sessionItemsTotal === 0 ? "Today's plan is empty." : "Today's plan";
  const subheadline =
    reviewCount === 0 && sessionItemsTotal === 0
      ? "Open the planner to start a quick session."
      : describeTodayCounts({ reviewCount, sessionItemsTotal, sessionItemsRemaining });

  return (
    <section
      data-testid="today-plan-summary-card"
      aria-labelledby="today-plan-summary-label"
      style={{ ...cardBaseStyle }}
    >
      <div
        id="today-plan-summary-label"
        style={{
          fontSize: "0.85rem",
          color: "#666",
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        Today
      </div>
      <div style={{ fontSize: "1.4rem", fontWeight: 600, marginTop: "0.25rem" }}>{headline}</div>
      <div style={{ fontSize: "0.95rem", color: "#444", marginTop: "0.5rem" }}>{subheadline}</div>
      <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.75rem" }}>
        <a
          href="/plan"
          data-testid="today-plan-summary-view-full"
          style={{
            padding: "0.45rem 0.85rem",
            background: "#3a82f7",
            color: "white",
            textDecoration: "none",
            borderRadius: 6,
            fontSize: "0.9rem",
          }}
        >
          View full plan
        </a>
        <a
          href={sessionHref}
          data-testid="today-plan-summary-start-session"
          style={{
            padding: "0.45rem 0.85rem",
            background: "white",
            color: "#3a82f7",
            border: "1px solid #3a82f7",
            textDecoration: "none",
            borderRadius: 6,
            fontSize: "0.9rem",
          }}
        >
          Start a session
        </a>
      </div>
    </section>
  );
}

function describeTodayCounts(input: {
  reviewCount: number;
  sessionItemsTotal: number;
  sessionItemsRemaining: number;
}): string {
  const { reviewCount, sessionItemsTotal, sessionItemsRemaining } = input;
  const parts: string[] = [];
  if (reviewCount > 0) {
    parts.push(
      reviewCount === 1 ? "1 concept ready for review" : `${reviewCount} concepts ready for review`,
    );
  }
  if (sessionItemsTotal > 0) {
    if (sessionItemsRemaining === 0) {
      parts.push(`${sessionItemsTotal} session items — all done`);
    } else if (sessionItemsRemaining === sessionItemsTotal) {
      parts.push(
        sessionItemsTotal === 1
          ? "1 session item to work on"
          : `${sessionItemsTotal} session items to work on`,
      );
    } else {
      parts.push(`${sessionItemsRemaining} of ${sessionItemsTotal} session items left`);
    }
  }
  if (parts.length === 0) return "Plan a quick session.";
  return parts.join(" · ");
}

export interface TodayPlanFullViewProps {
  plan: TodayPlanShape | null;
  activeTrackSlug: string | null;
}

// Full /plan-page surface. Shows:
//   - Today's section (review queue + session plan)
//   - This week (stub explaining STORY-032 dependency — no fake content)
//   - Reasoning toggle (revealed inline as a `<details>` block)
//   - Re-plan client controls — handled by the client wrapper that wraps this component
//
// This component is server-rendered. The client wrapper handles the re-plan POST + dampened
// banner. We split client/server so the SSR pass remains stable.
export function TodayPlanFullView(props: TodayPlanFullViewProps): ReactElement {
  const { plan, activeTrackSlug } = props;
  const reviewItems = plan?.review_items ?? [];
  const sessionItems = plan?.session_plan_items ?? [];
  const sessionHref = activeTrackSlug
    ? `/session?track=${encodeURIComponent(activeTrackSlug)}`
    : "/session";

  return (
    <div data-testid="today-plan-full-view" style={{ display: "grid", gap: "1.5rem" }}>
      <section
        aria-labelledby="today-plan-section-label"
        data-testid="today-plan-section"
        style={{ ...cardBaseStyle }}
      >
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: "1rem",
          }}
        >
          <div>
            <h2
              id="today-plan-section-label"
              style={{ margin: 0, fontSize: "1.2rem", fontWeight: 600 }}
            >
              Today
            </h2>
            <p style={{ margin: "0.25rem 0 0", color: "#666", fontSize: "0.9rem" }}>
              {plan?.date ? `Plan for ${plan.date}` : "Plan for today"}
            </p>
          </div>
          <a
            href={sessionHref}
            data-testid="today-plan-start-session"
            style={{
              padding: "0.5rem 0.9rem",
              background: "#3a82f7",
              color: "white",
              textDecoration: "none",
              borderRadius: 6,
              fontSize: "0.9rem",
            }}
          >
            Start a session
          </a>
        </header>

        <div style={{ marginTop: "1rem", display: "grid", gap: "1.25rem" }}>
          <ReviewQueueBlock items={reviewItems} />
          <SessionPlanBlock items={sessionItems} />
        </div>
      </section>

      <ThisWeekDeferredStub />
    </div>
  );
}

function ReviewQueueBlock({ items }: { items: TodayPlanReviewItem[] }): ReactElement {
  if (items.length === 0) {
    return (
      <div data-testid="review-queue-empty">
        <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>Review queue</h3>
        <p style={{ margin: "0.4rem 0 0", color: "#666", fontSize: "0.95rem" }}>
          Nothing due right now. Reviews will appear here as your concepts come up on the FSRS
          schedule.
        </p>
      </div>
    );
  }
  return (
    <div data-testid="review-queue-list">
      <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>
        Review queue · {items.length} ready
      </h3>
      <ul style={{ margin: "0.5rem 0 0", padding: "0 0 0 1rem", listStyle: "disc" }}>
        {items.map((it) => (
          <li
            key={it.concept_id}
            data-testid={`review-item-${it.concept_id}`}
            style={{ fontSize: "0.95rem", color: "#222", lineHeight: 1.5 }}
          >
            <span style={{ fontFamily: "monospace" }}>{it.concept_id}</span>
            {it.days_overdue > 0 ? (
              <span style={{ color: "#666", marginLeft: "0.5rem" }}>
                · {it.days_overdue === 1 ? "1 day ago" : `${it.days_overdue} days ago`}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SessionPlanBlock({ items }: { items: TodayPlanSessionItem[] }): ReactElement {
  if (items.length === 0) {
    return (
      <div data-testid="session-plan-empty">
        <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>Session plan</h3>
        <p style={{ margin: "0.4rem 0 0", color: "#666", fontSize: "0.95rem" }}>
          No active session plan yet. Start a session and the planner will build one for today.
        </p>
      </div>
    );
  }
  const remaining = items.filter((i) => i.status === "pending").length;
  return (
    <div data-testid="session-plan-list">
      <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>
        Session plan · {remaining} of {items.length} pending
      </h3>
      <ol
        style={{
          margin: "0.5rem 0 0",
          padding: "0 0 0 1rem",
          listStyle: "decimal",
        }}
      >
        {items.map((it) => (
          <li
            key={it.slug}
            data-testid={`session-item-${it.slug}`}
            data-status={it.status}
            style={{
              fontSize: "0.95rem",
              color: it.status === "completed" ? "#666" : "#222",
              lineHeight: 1.5,
              textDecoration: it.status === "completed" ? "line-through" : "none",
            }}
          >
            {it.objective}{" "}
            <span style={{ color: "#888", fontSize: "0.85rem" }}>
              (~{it.estimated_duration_min} min)
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// "This week" stub. We intentionally do NOT render a fake weekly plan. STORY-046b will land
// when STORY-032 (knowledge graph population) is done.
export function ThisWeekDeferredStub(): ReactElement {
  return (
    <section
      aria-labelledby="this-week-section-label"
      data-testid="this-week-deferred-stub"
      style={{ ...cardBaseStyle, background: "#f8f9fb" }}
    >
      <h2 id="this-week-section-label" style={{ margin: 0, fontSize: "1.1rem", fontWeight: 600 }}>
        This week
      </h2>
      <p style={{ margin: "0.5rem 0 0", color: "#444", fontSize: "0.95rem", lineHeight: 1.5 }}>
        Weekly themed plans land alongside the knowledge-graph work (STORY-032). When that ships,
        you&apos;ll see a one-week theme here — for now, today&apos;s plan above is your focus.
      </p>
    </section>
  );
}

// Reasoning panel — the AC #6 advanced toggle. Wraps the today plan's reasoning text in a
// native `<details>` element so it works without JS (server-only fallback) and is keyboard-
// accessible by default.
export interface PlanReasoningPanelProps {
  plan: TodayPlanShape;
}

export function PlanReasoningPanel(props: PlanReasoningPanelProps): ReactElement {
  const { plan } = props;
  const hasContent = plan.review_items.length > 0 || plan.session_plan_items.length > 0;
  return (
    <details data-testid="plan-reasoning-panel" style={{ ...cardBaseStyle, background: "#fcfcfd" }}>
      <summary
        style={{
          fontSize: "0.95rem",
          fontWeight: 600,
          cursor: "pointer",
          listStyle: "revert",
        }}
      >
        Show planner reasoning (advanced)
      </summary>
      <div style={{ marginTop: "0.75rem", display: "grid", gap: "0.85rem" }}>
        {!hasContent ? (
          <p style={{ margin: 0, color: "#666", fontSize: "0.9rem" }}>
            No reasoning to show — today&apos;s plan is empty.
          </p>
        ) : null}
        {plan.review_items.length > 0 ? (
          <div data-testid="reasoning-reviews">
            <h4 style={{ margin: 0, fontSize: "0.9rem", fontWeight: 600 }}>Why these reviews?</h4>
            <ul style={{ margin: "0.4rem 0 0", padding: "0 0 0 1rem" }}>
              {plan.review_items.map((it) => (
                <li
                  key={it.concept_id}
                  style={{ fontSize: "0.9rem", color: "#444", lineHeight: 1.5 }}
                >
                  <span style={{ fontFamily: "monospace" }}>{it.concept_id}</span>
                  {": "}
                  {it.reasoning}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {plan.session_plan_items.length > 0 ? (
          <div data-testid="reasoning-session-plan">
            <h4 style={{ margin: 0, fontSize: "0.9rem", fontWeight: 600 }}>
              Why these session items?
            </h4>
            <ul style={{ margin: "0.4rem 0 0", padding: "0 0 0 1rem" }}>
              {plan.session_plan_items.map((it) => (
                <li key={it.slug} style={{ fontSize: "0.9rem", color: "#444", lineHeight: 1.5 }}>
                  <span style={{ fontFamily: "monospace" }}>{it.slug}</span>
                  {": "}
                  {it.reasoning}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </details>
  );
}
