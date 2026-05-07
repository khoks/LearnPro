"use client";

import * as React from "react";
import { useState } from "react";
import type { CSSProperties, ReactElement } from "react";

void React;

// STORY-046b — `<WeeklyPlanCard>` renders the week's theme + a 7-day grid (one row per weekday)
// showing the suggested concept(s) plus their reasoning. Replaces the `<ThisWeekDeferredStub>` on
// the /plan page now that STORY-032 (knowledge graph) is populated.
//
// Coach-voice copy. Anti-dark-pattern: re-plan failures and dampened states surface a calm
// banner, never an alert / urgency / shame.
//
// LLM-generated theme names are intentionally NOT used here. v1 uses the dominant concept's
// `name` field as the theme ("List comprehensions week"). LLM-gen is a separate follow-up.

const cardBaseStyle: CSSProperties = {
  border: "1px solid #e3e3e3",
  borderRadius: 8,
  padding: "1.25rem 1.5rem",
  background: "white",
};

export interface WeeklyPlanDayConceptShape {
  day_index: number;
  concept_slug: string;
  reasoning: string;
}

export interface WeeklyPlanShape {
  week_start_date: string;
  theme: string;
  theme_concept_slug: string;
  daily_concepts: WeeklyPlanDayConceptShape[];
  theme_concepts: string[];
  due_reviews_count: number;
  dampening: { suppressed_replan_reason?: string; adaptive_adjustment_reason?: string };
}

export interface WeeklyPlanLoadResult {
  status: "ok" | "unavailable" | "error";
  // Populated when status === "ok".
  plan?: WeeklyPlanShape;
  // Populated when status === "unavailable" or "error" — the friendly message to show.
  message?: string;
  track_slug?: string;
}

export interface WeeklyPlanCardProps {
  initial: WeeklyPlanLoadResult;
  // Optional override for the proxy URL — tests pass a custom fetch via `fetchImpl` instead;
  // production reads this URL.
  apiPath?: string;
  // Test-only fetch shim. When provided, overrides `globalThis.fetch`.
  fetchImpl?: typeof fetch;
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface ReplanState {
  status: "idle" | "loading" | "dampened" | "regenerated" | "error";
  message: string | null;
}

const idleState: ReplanState = { status: "idle", message: null };

export function WeeklyPlanCard(props: WeeklyPlanCardProps): ReactElement {
  const [load, setLoad] = useState<WeeklyPlanLoadResult>(props.initial);
  const [replan, setReplan] = useState<ReplanState>(idleState);
  const fetchImpl = props.fetchImpl ?? globalThis.fetch.bind(globalThis);

  async function onReplan(): Promise<void> {
    setReplan({ status: "loading", message: null });
    try {
      const apiPath = props.apiPath ?? "/api/weekly-plan";
      const url = load.track_slug
        ? `${apiPath}?track_slug=${encodeURIComponent(load.track_slug)}`
        : apiPath;
      const res = await fetchImpl(url, { method: "POST" });
      if (!res.ok) {
        setReplan({
          status: "error",
          message: "Re-planner is briefly unavailable. Try again in a moment.",
        });
        return;
      }
      const body = (await res.json()) as {
        weekly_plan: WeeklyPlanShape;
        dampened: boolean;
        reason?: string;
        track_slug?: string;
      };
      setLoad({
        status: "ok",
        plan: body.weekly_plan,
        ...(body.track_slug !== undefined && { track_slug: body.track_slug }),
      });
      if (body.dampened === true) {
        setReplan({
          status: "dampened",
          message: body.reason ?? "Your weekly plan still applies — re-plan was suppressed.",
        });
      } else {
        setReplan({
          status: "regenerated",
          message: "Weekly plan refreshed.",
        });
      }
    } catch {
      setReplan({
        status: "error",
        message: "Couldn't reach the planner just now. Try again in a moment.",
      });
    }
  }

  if (load.status === "unavailable") {
    return (
      <section
        aria-labelledby="weekly-plan-unavailable-label"
        data-testid="weekly-plan-unavailable"
        style={{ ...cardBaseStyle, background: "#f8f9fb" }}
      >
        <h2
          id="weekly-plan-unavailable-label"
          style={{ margin: 0, fontSize: "1.1rem", fontWeight: 600 }}
        >
          This week
        </h2>
        <p style={{ margin: "0.5rem 0 0", color: "#444", fontSize: "0.95rem", lineHeight: 1.5 }}>
          {load.message ??
            "Weekly themes draw on the populated knowledge graph. Once your track has its graph seeded, you'll see a one-week theme here."}
        </p>
      </section>
    );
  }

  if (load.status === "error" || !load.plan) {
    return (
      <section
        aria-labelledby="weekly-plan-error-label"
        data-testid="weekly-plan-error"
        style={{ ...cardBaseStyle, background: "#fdecea" }}
      >
        <h2 id="weekly-plan-error-label" style={{ margin: 0, fontSize: "1.1rem", fontWeight: 600 }}>
          This week
        </h2>
        <p style={{ margin: "0.5rem 0 0", color: "#a14336", fontSize: "0.95rem" }}>
          {load.message ?? "We couldn't load the weekly plan right now. Try again shortly."}
        </p>
      </section>
    );
  }

  const plan = load.plan;
  return (
    <section
      aria-labelledby="weekly-plan-section-label"
      data-testid="weekly-plan-card"
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
            id="weekly-plan-section-label"
            style={{ margin: 0, fontSize: "1.2rem", fontWeight: 600 }}
          >
            This week&apos;s theme
          </h2>
          <p
            data-testid="weekly-plan-theme"
            style={{ margin: "0.25rem 0 0", color: "#222", fontSize: "1rem" }}
          >
            {plan.theme}
          </p>
          <p style={{ margin: "0.15rem 0 0", color: "#666", fontSize: "0.85rem" }}>
            Week of {plan.week_start_date}
          </p>
        </div>
        <button
          type="button"
          data-testid="weekly-replan-button"
          disabled={replan.status === "loading"}
          onClick={() => {
            void onReplan();
          }}
          style={{
            padding: "0.45rem 0.85rem",
            background: replan.status === "loading" ? "#bbb" : "white",
            color: "#13447a",
            border: "1px solid #13447a",
            borderRadius: 6,
            fontSize: "0.9rem",
            cursor: replan.status === "loading" ? "not-allowed" : "pointer",
          }}
        >
          {replan.status === "loading" ? "Re-planning…" : "Re-plan week"}
        </button>
      </header>

      {replan.message ? (
        <div
          data-testid={`weekly-replan-banner-${replan.status}`}
          role="status"
          aria-live="polite"
          style={{
            marginTop: "0.75rem",
            padding: "0.6rem 0.9rem",
            borderRadius: 6,
            background: replan.status === "error" ? "#fdecea" : "#eef6ff",
            color: replan.status === "error" ? "#a14336" : "#13447a",
            fontSize: "0.95rem",
          }}
        >
          {replan.message}
        </div>
      ) : null}

      {plan.dampening.adaptive_adjustment_reason ? (
        <div
          data-testid="weekly-adaptive-banner"
          style={{
            marginTop: "0.75rem",
            padding: "0.6rem 0.9rem",
            borderRadius: 6,
            background: "#f4f1ff",
            color: "#4a3990",
            fontSize: "0.9rem",
          }}
        >
          {plan.dampening.adaptive_adjustment_reason}
        </div>
      ) : null}

      <ol
        data-testid="weekly-plan-day-grid"
        style={{
          margin: "1rem 0 0",
          padding: 0,
          listStyle: "none",
          display: "grid",
          gap: "0.5rem",
        }}
      >
        {plan.daily_concepts.map((day) => (
          <li
            key={day.day_index}
            data-testid={`weekly-day-${day.day_index}`}
            style={{
              display: "grid",
              gridTemplateColumns: "60px 1fr",
              gap: "0.75rem",
              padding: "0.5rem 0.75rem",
              border: "1px solid #eee",
              borderRadius: 6,
              background: day.concept_slug === plan.theme_concept_slug ? "#f5faff" : "white",
              alignItems: "center",
            }}
          >
            <div
              style={{
                fontWeight: 600,
                color: "#444",
                fontSize: "0.85rem",
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              {DAY_LABELS[day.day_index] ?? `Day ${day.day_index + 1}`}
            </div>
            <div>
              <div style={{ fontFamily: "monospace", fontSize: "0.9rem", color: "#222" }}>
                {day.concept_slug}
              </div>
              <div
                style={{
                  fontSize: "0.85rem",
                  color: "#666",
                  marginTop: "0.2rem",
                  lineHeight: 1.4,
                }}
              >
                {day.reasoning}
              </div>
            </div>
          </li>
        ))}
      </ol>

      {plan.due_reviews_count > 0 ? (
        <p
          data-testid="weekly-due-reviews"
          style={{ margin: "0.75rem 0 0", color: "#444", fontSize: "0.9rem" }}
        >
          {plan.due_reviews_count === 1
            ? "1 concept is also due for a quick review this week."
            : `${plan.due_reviews_count} concepts are also due for a quick review this week.`}
        </p>
      ) : null}

      <details
        data-testid="weekly-reasoning-panel"
        style={{
          marginTop: "1rem",
          padding: "0.75rem 0.9rem",
          background: "#fcfcfd",
          border: "1px solid #eee",
          borderRadius: 6,
        }}
      >
        <summary
          style={{ fontSize: "0.95rem", fontWeight: 600, cursor: "pointer", listStyle: "revert" }}
        >
          Show planner reasoning (advanced)
        </summary>
        <div style={{ marginTop: "0.75rem", display: "grid", gap: "0.5rem" }}>
          <div>
            <h4 style={{ margin: 0, fontSize: "0.9rem", fontWeight: 600 }}>Why this theme?</h4>
            <p style={{ margin: "0.4rem 0 0", color: "#444", fontSize: "0.9rem", lineHeight: 1.5 }}>
              The planner walked your track in topological order from the latest concept you&apos;ve
              passed and picked {plan.theme_concept_slug} as the next coherent stretch. This
              week&apos;s suggested concepts:
            </p>
            <ul style={{ margin: "0.4rem 0 0", padding: "0 0 0 1rem" }}>
              {plan.theme_concepts.map((slug) => (
                <li
                  key={slug}
                  style={{
                    fontSize: "0.85rem",
                    color: "#444",
                    fontFamily: "monospace",
                    lineHeight: 1.6,
                  }}
                >
                  {slug}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </details>
    </section>
  );
}
