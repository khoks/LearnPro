import { z } from "zod";
import type { PlanSessionDeps, PlanSessionRecentEpisode } from "../ports.js";

// STORY-015 — generates a 3-5 item plan for the session via the LLM. On parse failure or
// over-budget output, returns a deterministic 3-item fallback so the API route never 500s.
//
// The tool produces ITEMS (slug + objective + estimated_duration_min). It does NOT persist —
// the API route owns persistence so the same generated plan can be returned across the GET/POST
// idempotency window without re-calling the LLM.

export const PlanSessionItemSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9-]+$/, "slug must be kebab-case (lowercase + digits + hyphens)"),
  objective: z.string().min(1).max(280),
  estimated_duration_min: z.number().int().positive().max(120),
});
export type PlanSessionItem = z.infer<typeof PlanSessionItemSchema>;

export const PlanSessionInputSchema = z.object({
  user_id: z.string().uuid(),
  time_budget_min: z.number().int().positive().max(180).default(25),
  target_role: z.string().nullable().default(null),
  primary_goal: z.string().nullable().default(null),
  current_track: z.string().min(1).default("python-fundamentals"),
  recent_episodes: z
    .array(
      z.object({
        slug: z.string().min(1),
        final_outcome: z.string().nullable(),
        difficulty: z.string().nullable(),
      }),
    )
    .max(20)
    .default([]),
});
export type PlanSessionInput = z.input<typeof PlanSessionInputSchema>;

export const PlanSessionOutputSchema = z.object({
  items: z.array(PlanSessionItemSchema).min(3).max(5),
  // `fallback` is true when the LLM output failed parsing / was over-budget and the
  // deterministic plan was substituted. Surfaced so callers can flag it in telemetry.
  fallback: z.boolean(),
});
export type PlanSessionOutput = z.infer<typeof PlanSessionOutputSchema>;

export interface PlanSessionTool {
  readonly name: "planSession";
  run(input: PlanSessionInput): Promise<PlanSessionOutput>;
}

export interface CreatePlanSessionToolOptions {
  deps: PlanSessionDeps;
}

export function createPlanSessionTool(opts: CreatePlanSessionToolOptions): PlanSessionTool {
  return {
    name: "planSession",
    async run(rawInput) {
      const input = PlanSessionInputSchema.parse(rawInput);
      const llm = await opts.deps.generatePlan({
        user_id: input.user_id,
        time_budget_min: input.time_budget_min,
        target_role: input.target_role,
        primary_goal: input.primary_goal,
        current_track: input.current_track,
        recent_episodes: input.recent_episodes,
      });

      const parsed = parsePlanItems(llm.raw_text);
      if (parsed) {
        const truncated = truncateToBudget(parsed, input.time_budget_min);
        if (truncated.length >= 3) {
          return { items: truncated, fallback: false };
        }
      }
      return { items: deterministicFallbackItems(input), fallback: true };
    },
  };
}

// Strips a markdown ```json ... ``` fence if present, then JSON-parses. Returns null on failure
// (or if the shape doesn't match { items: [{ slug, objective, estimated_duration_min }, ...] }).
export function parsePlanItems(raw: string): PlanSessionItem[] | null {
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const itemsRaw = (parsed as Record<string, unknown>)["items"];
  if (!Array.isArray(itemsRaw)) return null;
  const out: PlanSessionItem[] = [];
  for (const r of itemsRaw) {
    const v = PlanSessionItemSchema.safeParse(r);
    if (v.success) out.push(v.data);
  }
  return out.length === 0 ? null : out;
}

// Walks items in order, keeping only those that fit within the cumulative budget. Caps at 5.
// Stops as soon as one item would push the running total past `budget_min`.
export function truncateToBudget(
  items: ReadonlyArray<PlanSessionItem>,
  budget_min: number,
): PlanSessionItem[] {
  const out: PlanSessionItem[] = [];
  let used = 0;
  for (const it of items) {
    if (out.length >= 5) break;
    if (used + it.estimated_duration_min > budget_min) break;
    out.push(it);
    used += it.estimated_duration_min;
  }
  return out;
}

// Deterministic 3-item baseline. Slugs are stable + recognizable for the auto-mark logic in
// updateProfile (warmup / practice / stretch). Total duration is bounded by `time_budget_min`.
export function deterministicFallbackItems(input: {
  time_budget_min: number;
  recent_episodes: ReadonlyArray<PlanSessionRecentEpisode>;
}): PlanSessionItem[] {
  const budget = Math.max(15, Math.min(60, input.time_budget_min));
  const warmupMin = Math.max(5, Math.floor(budget * 0.3));
  const practiceMin = Math.max(5, Math.floor(budget * 0.4));
  const stretchMin = Math.max(5, budget - warmupMin - practiceMin);
  const recentSlug = input.recent_episodes[0]?.slug ?? null;
  return [
    {
      slug: recentSlug ?? "warmup",
      objective: recentSlug
        ? `Re-attempt ${recentSlug} as a warm-up`
        : "Solve a recent-difficulty problem to warm up",
      estimated_duration_min: warmupMin,
    },
    {
      slug: "practice",
      objective: "Practice a core pattern at the same level",
      estimated_duration_min: practiceMin,
    },
    {
      slug: "stretch",
      objective: "Take a slightly stretching problem to push your edge",
      estimated_duration_min: stretchMin,
    },
  ];
}
