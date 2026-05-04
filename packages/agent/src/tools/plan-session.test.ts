import { describe, expect, it, vi } from "vitest";
import type { PlanSessionDeps } from "../ports.js";
import {
  createPlanSessionTool,
  deterministicFallbackItems,
  parsePlanItems,
  truncateToBudget,
} from "./plan-session.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";

function fakeDeps(opts: {
  text: string;
  recordCalls?: boolean;
}): PlanSessionDeps & { generateMock: ReturnType<typeof vi.fn> } {
  const generateMock = vi.fn(async () => ({ raw_text: opts.text }));
  return { generateMock, generatePlan: generateMock };
}

describe("parsePlanItems", () => {
  it("parses a clean JSON object with items array", () => {
    const raw = JSON.stringify({
      items: [
        { slug: "warmup", objective: "Solve a warmup", estimated_duration_min: 8 },
        { slug: "list-comp", objective: "List comprehension drill", estimated_duration_min: 10 },
        { slug: "stretch", objective: "Slightly harder problem", estimated_duration_min: 12 },
      ],
    });
    const parsed = parsePlanItems(raw);
    expect(parsed).toHaveLength(3);
    expect(parsed?.[0]?.slug).toBe("warmup");
  });

  it("strips a markdown ```json fence", () => {
    const raw =
      "```json\n" +
      JSON.stringify({
        items: [
          { slug: "a", objective: "A", estimated_duration_min: 5 },
          { slug: "b", objective: "B", estimated_duration_min: 5 },
          { slug: "c", objective: "C", estimated_duration_min: 5 },
        ],
      }) +
      "\n```";
    const parsed = parsePlanItems(raw);
    expect(parsed).toHaveLength(3);
  });

  it("skips invalid items but keeps valid ones", () => {
    const raw = JSON.stringify({
      items: [
        { slug: "OK_no_caps", objective: "bad slug", estimated_duration_min: 5 },
        { slug: "good", objective: "good item", estimated_duration_min: 5 },
        { slug: "another-good", objective: "another", estimated_duration_min: 5 },
      ],
    });
    const parsed = parsePlanItems(raw);
    expect(parsed).toHaveLength(2);
    expect(parsed?.map((i) => i.slug)).toEqual(["good", "another-good"]);
  });

  it("returns null on non-JSON", () => {
    expect(parsePlanItems("hello world")).toBeNull();
  });

  it("returns null when items is missing or not an array", () => {
    expect(parsePlanItems(JSON.stringify({ foo: "bar" }))).toBeNull();
    expect(parsePlanItems(JSON.stringify({ items: "not array" }))).toBeNull();
  });

  it("returns null when items array has no valid entries", () => {
    expect(parsePlanItems(JSON.stringify({ items: [{ wrong: "shape" }] }))).toBeNull();
  });
});

describe("truncateToBudget", () => {
  it("keeps items that fit within the cumulative budget", () => {
    const items = [
      { slug: "a", objective: "A", estimated_duration_min: 10 },
      { slug: "b", objective: "B", estimated_duration_min: 10 },
      { slug: "c", objective: "C", estimated_duration_min: 10 },
    ];
    expect(truncateToBudget(items, 25)).toHaveLength(2);
  });

  it("caps at 5 items even when budget allows more", () => {
    const items = Array.from({ length: 8 }, (_, i) => ({
      slug: `s-${i}`,
      objective: `o-${i}`,
      estimated_duration_min: 1,
    }));
    expect(truncateToBudget(items, 60)).toHaveLength(5);
  });

  it("returns empty when first item already exceeds budget", () => {
    expect(
      truncateToBudget([{ slug: "x", objective: "x", estimated_duration_min: 30 }], 10),
    ).toEqual([]);
  });
});

describe("deterministicFallbackItems", () => {
  it("returns 3 items totaling at most the time budget", () => {
    const items = deterministicFallbackItems({ time_budget_min: 25, recent_episodes: [] });
    expect(items).toHaveLength(3);
    const total = items.reduce((s, i) => s + i.estimated_duration_min, 0);
    expect(total).toBeLessThanOrEqual(25);
  });

  it("uses the most-recent episode slug for the warmup when available", () => {
    const items = deterministicFallbackItems({
      time_budget_min: 25,
      recent_episodes: [
        { slug: "two-sum", final_outcome: "failed", difficulty: "medium" },
        { slug: "fizzbuzz", final_outcome: "passed", difficulty: "easy" },
      ],
    });
    expect(items[0]?.slug).toBe("two-sum");
    expect(items[0]?.objective.toLowerCase()).toContain("two-sum");
  });

  it("clamps tiny budgets to a sensible minimum so items still fit", () => {
    const items = deterministicFallbackItems({ time_budget_min: 5, recent_episodes: [] });
    expect(items).toHaveLength(3);
    for (const it of items) {
      expect(it.estimated_duration_min).toBeGreaterThanOrEqual(5);
    }
  });
});

describe("createPlanSessionTool", () => {
  it("validates input via Zod (rejects non-uuid user_id)", async () => {
    const deps = fakeDeps({ text: "{}" });
    const tool = createPlanSessionTool({ deps });
    await expect(tool.run({ user_id: "not-a-uuid" })).rejects.toThrow();
  });

  it("happy path: returns parsed LLM items with fallback=false", async () => {
    const text = JSON.stringify({
      items: [
        { slug: "warmup", objective: "Solve a warmup", estimated_duration_min: 8 },
        { slug: "list-comp", objective: "List comprehension drill", estimated_duration_min: 10 },
        { slug: "stretch", objective: "Slightly harder problem", estimated_duration_min: 7 },
      ],
    });
    const deps = fakeDeps({ text });
    const tool = createPlanSessionTool({ deps });
    const out = await tool.run({ user_id: USER_ID, time_budget_min: 25 });
    expect(out.fallback).toBe(false);
    expect(out.items).toHaveLength(3);
    expect(out.items[0]?.slug).toBe("warmup");
  });

  it("LLM parse failure → deterministic fallback (3 items, fallback=true)", async () => {
    const deps = fakeDeps({ text: "I'm not JSON" });
    const tool = createPlanSessionTool({ deps });
    const out = await tool.run({ user_id: USER_ID, time_budget_min: 25 });
    expect(out.fallback).toBe(true);
    expect(out.items).toHaveLength(3);
  });

  it("over-budget items truncated; if fewer than 3 survive → fallback", async () => {
    const text = JSON.stringify({
      items: [
        { slug: "huge", objective: "A huge task", estimated_duration_min: 60 },
        { slug: "another", objective: "Another huge", estimated_duration_min: 60 },
      ],
    });
    const deps = fakeDeps({ text });
    const tool = createPlanSessionTool({ deps });
    const out = await tool.run({ user_id: USER_ID, time_budget_min: 25 });
    expect(out.fallback).toBe(true);
    expect(out.items).toHaveLength(3);
  });

  it("over-budget but ≥3 items survive → keep parsed (fallback=false), truncated", async () => {
    const text = JSON.stringify({
      items: [
        { slug: "small-1", objective: "A", estimated_duration_min: 5 },
        { slug: "small-2", objective: "B", estimated_duration_min: 5 },
        { slug: "small-3", objective: "C", estimated_duration_min: 5 },
        { slug: "huge", objective: "huge", estimated_duration_min: 60 },
      ],
    });
    const deps = fakeDeps({ text });
    const tool = createPlanSessionTool({ deps });
    const out = await tool.run({ user_id: USER_ID, time_budget_min: 25 });
    expect(out.fallback).toBe(false);
    expect(out.items).toHaveLength(3);
    expect(out.items.map((i) => i.slug)).toEqual(["small-1", "small-2", "small-3"]);
  });

  it("default time_budget_min is 25 when not supplied", async () => {
    const text = JSON.stringify({
      items: [
        { slug: "a", objective: "A", estimated_duration_min: 8 },
        { slug: "b", objective: "B", estimated_duration_min: 8 },
        { slug: "c", objective: "C", estimated_duration_min: 8 },
      ],
    });
    const deps = fakeDeps({ text });
    const tool = createPlanSessionTool({ deps });
    const out = await tool.run({ user_id: USER_ID });
    expect(out.fallback).toBe(false);
    expect(out.items).toHaveLength(3);
  });

  it("forwards profile + recent_episodes to the LLM dep", async () => {
    const text = JSON.stringify({
      items: [
        { slug: "a", objective: "A", estimated_duration_min: 5 },
        { slug: "b", objective: "B", estimated_duration_min: 5 },
        { slug: "c", objective: "C", estimated_duration_min: 5 },
      ],
    });
    const deps = fakeDeps({ text });
    const tool = createPlanSessionTool({ deps });
    await tool.run({
      user_id: USER_ID,
      time_budget_min: 30,
      target_role: "backend_swe_intern",
      primary_goal: "land internship",
      current_track: "python-fundamentals",
      recent_episodes: [{ slug: "fizzbuzz", final_outcome: "passed", difficulty: "easy" }],
    });
    const call = deps.generateMock.mock.calls[0]?.[0];
    expect(call?.user_id).toBe(USER_ID);
    expect(call?.target_role).toBe("backend_swe_intern");
    expect(call?.primary_goal).toBe("land internship");
    expect(call?.recent_episodes).toHaveLength(1);
  });
});
