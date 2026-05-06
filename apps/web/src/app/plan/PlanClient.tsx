"use client";

import * as React from "react";
import { useState } from "react";
import {
  PlanReasoningPanel,
  TodayPlanFullView,
  type TodayPlanShape,
} from "./plan-view";

void React;

// STORY-046 — client wrapper around the server-rendered plan view. Owns the re-plan POST
// + dampened-banner state. We split server (TodayPlanFullView, PlanReasoningPanel) from
// client (this) so the SSR render is stable and the only thing that hydrates is the
// re-plan controls + reasoning toggle.
//
// Coach-voice copy. Anti-dark-pattern: re-plan failures and dampened states surface a calm
// banner, never an alert / urgency / shame.

export interface PlanClientProps {
  initialPlan: TodayPlanShape | null;
  activeTrackSlug: string | null;
}

interface ReplanState {
  status: "idle" | "loading" | "dampened" | "regenerated" | "error";
  message: string | null;
}

const idleState: ReplanState = { status: "idle", message: null };

export function PlanClient(props: PlanClientProps) {
  const [plan, setPlan] = useState<TodayPlanShape | null>(props.initialPlan);
  const [replan, setReplan] = useState<ReplanState>(idleState);

  async function onReplan() {
    setReplan({ status: "loading", message: null });
    try {
      const res = await fetch("/api/today-plan/replan", { method: "POST" });
      if (!res.ok) {
        setReplan({
          status: "error",
          message: "Re-planner is briefly unavailable. Try again in a moment.",
        });
        return;
      }
      const body = (await res.json()) as {
        today_plan: TodayPlanShape;
        dampened: boolean;
        reason?: string;
      };
      setPlan(body.today_plan);
      if (body.dampened === true) {
        setReplan({
          status: "dampened",
          message: body.reason ?? "Your plan still applies — re-plan was suppressed.",
        });
      } else {
        setReplan({
          status: "regenerated",
          message: "Plan refreshed for today.",
        });
      }
    } catch {
      setReplan({
        status: "error",
        message: "Couldn't reach the planner just now. Try again in a moment.",
      });
    }
  }

  return (
    <div style={{ display: "grid", gap: "1.5rem" }}>
      <ReplanBar status={replan} onReplan={onReplan} />
      <TodayPlanFullView plan={plan} activeTrackSlug={props.activeTrackSlug} />
      {plan ? <PlanReasoningPanel plan={plan} /> : null}
    </div>
  );
}

function ReplanBar({
  status,
  onReplan,
}: {
  status: ReplanState;
  onReplan: () => void;
}) {
  const banner = status.message ? (
    <div
      data-testid={`replan-banner-${status.status}`}
      role="status"
      aria-live="polite"
      style={{
        padding: "0.6rem 0.9rem",
        borderRadius: 6,
        background: status.status === "error" ? "#fdecea" : "#eef6ff",
        color: status.status === "error" ? "#a14336" : "#13447a",
        fontSize: "0.95rem",
      }}
    >
      {status.message}
    </div>
  ) : null;

  return (
    <div
      data-testid="replan-bar"
      style={{
        display: "grid",
        gap: "0.5rem",
        gridTemplateColumns: "1fr",
      }}
    >
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          data-testid="replan-button"
          disabled={status.status === "loading"}
          onClick={onReplan}
          style={{
            padding: "0.45rem 0.85rem",
            background: status.status === "loading" ? "#bbb" : "white",
            color: "#13447a",
            border: "1px solid #13447a",
            borderRadius: 6,
            fontSize: "0.9rem",
            cursor: status.status === "loading" ? "not-allowed" : "pointer",
          }}
        >
          {status.status === "loading" ? "Re-planning…" : "Re-plan"}
        </button>
      </div>
      {banner}
    </div>
  );
}
