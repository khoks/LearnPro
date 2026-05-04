// Pure, framework-free state for the SessionPlanSidebar (STORY-015).

export interface SessionPlanItem {
  slug: string;
  objective: string;
  estimated_duration_min: number;
  status: "pending" | "completed";
  completed_at?: string;
  episode_id?: string;
}

export interface SessionPlan {
  id: string;
  user_id: string;
  created_at: string;
  expires_at: string;
  time_budget_min: number;
  items: SessionPlanItem[];
}

export type SessionPlanState =
  | { phase: "loading" }
  | { phase: "skipped" }
  | { phase: "ready"; plan: SessionPlan; fallback: boolean }
  | { phase: "empty" }
  | { phase: "error"; message: string };

export const initialPlanState: SessionPlanState = { phase: "loading" };

export type SessionPlanAction =
  | { type: "load_succeeded"; plan: SessionPlan | null; fallback: boolean }
  | { type: "load_failed"; message: string }
  | { type: "item_marked"; plan: SessionPlan }
  | { type: "skip" }
  | { type: "reset" };

export function planReducer(state: SessionPlanState, action: SessionPlanAction): SessionPlanState {
  if (action.type === "skip") return { phase: "skipped" };
  if (action.type === "reset") return { phase: "loading" };
  switch (action.type) {
    case "load_succeeded":
      if (!action.plan) return { phase: "empty" };
      return { phase: "ready", plan: action.plan, fallback: action.fallback };
    case "load_failed":
      return { phase: "error", message: action.message };
    case "item_marked":
      return { phase: "ready", plan: action.plan, fallback: false };
  }
}

// Pure helpers — exported for component-level rendering tests.

export function pendingCount(plan: SessionPlan): number {
  return plan.items.filter((i) => i.status === "pending").length;
}

export function completedCount(plan: SessionPlan): number {
  return plan.items.filter((i) => i.status === "completed").length;
}

export function totalDurationMin(plan: SessionPlan): number {
  return plan.items.reduce((s, i) => s + i.estimated_duration_min, 0);
}
