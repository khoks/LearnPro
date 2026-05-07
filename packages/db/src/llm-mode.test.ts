import { describe, expect, it } from "vitest";
import { TutorModeSchema } from "./llm-mode.js";

// STORY-036 — Unit-level coverage for the TutorModeSchema. The DB-integration tests
// (against a real Postgres) live in the Pg-gated suites alongside other helpers.

describe("TutorModeSchema", () => {
  it("accepts the three documented modes", () => {
    expect(TutorModeSchema.parse("cloud")).toBe("cloud");
    expect(TutorModeSchema.parse("local")).toBe("local");
    expect(TutorModeSchema.parse("auto-fallback")).toBe("auto-fallback");
  });

  it("rejects an arbitrary string", () => {
    expect(() => TutorModeSchema.parse("hybrid")).toThrow();
  });

  it("rejects null / undefined", () => {
    expect(() => TutorModeSchema.parse(null)).toThrow();
    expect(() => TutorModeSchema.parse(undefined)).toThrow();
  });
});
