import { describe, expect, it } from "vitest";
import { loadAllEvalCases } from "./loader.js";

describe("loadAllEvalCases", () => {
  it("loads at least 50 transcripts (the spec target)", async () => {
    const cases = await loadAllEvalCases();
    expect(cases.length).toBeGreaterThanOrEqual(50);
    for (const c of cases) {
      expect(c.id).toMatch(/^[a-z0-9-]+$/);
      expect(c.expected_behavior_tags.length).toBeGreaterThan(0);
      expect(c.input.messages.length).toBeGreaterThan(0);
    }
  });

  it("has the spec distribution: ≥15 hint, ≥15 grade, ≥10 onboarding, ≥10 session-plan", async () => {
    const cases = await loadAllEvalCases();
    const counts: Record<string, number> = { hint: 0, grade: 0, onboarding: 0, "session-plan": 0 };
    for (const c of cases) counts[c.category]! += 1;
    expect(counts["hint"]).toBeGreaterThanOrEqual(15);
    expect(counts["grade"]).toBeGreaterThanOrEqual(15);
    expect(counts["onboarding"]).toBeGreaterThanOrEqual(10);
    expect(counts["session-plan"]).toBeGreaterThanOrEqual(10);
  });

  it("ids are unique across cases", async () => {
    const cases = await loadAllEvalCases();
    const ids = cases.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
