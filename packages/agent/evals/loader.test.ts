import { describe, expect, it } from "vitest";
import { loadAllEvalCases } from "./loader.js";

describe("loadAllEvalCases", () => {
  it("loads every transcript and parses cleanly through EvalCaseSchema", async () => {
    const cases = await loadAllEvalCases();
    expect(cases.length).toBeGreaterThanOrEqual(10);
    for (const c of cases) {
      expect(c.id).toMatch(/^[a-z0-9-]+$/);
      expect(c.expected_behavior_tags.length).toBeGreaterThan(0);
      expect(c.input.messages.length).toBeGreaterThan(0);
    }
  });

  it("has all four categories represented", async () => {
    const cases = await loadAllEvalCases();
    const cats = new Set(cases.map((c) => c.category));
    expect(cats.has("hint")).toBe(true);
    expect(cats.has("grade")).toBe(true);
    expect(cats.has("onboarding")).toBe(true);
    expect(cats.has("session-plan")).toBe(true);
  });

  it("ids are unique across cases", async () => {
    const cases = await loadAllEvalCases();
    const ids = cases.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
