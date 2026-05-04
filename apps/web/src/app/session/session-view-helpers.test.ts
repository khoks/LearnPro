import { describe, expect, it } from "vitest";
import {
  difficultyBadgePalette,
  formatExpectedGot,
  humanizeOutcome,
  rubricBarColor,
  rubricPct,
  skillDeltaArrow,
  skillDeltaSymbol,
} from "./session-view-helpers";

describe("rubricBarColor", () => {
  it("returns green at >= 0.8", () => {
    expect(rubricBarColor(1.0)).toBe("#2e7d32");
    expect(rubricBarColor(0.8)).toBe("#2e7d32");
  });
  it("returns amber at 0.5..0.79", () => {
    expect(rubricBarColor(0.79)).toBe("#f9a825");
    expect(rubricBarColor(0.5)).toBe("#f9a825");
  });
  it("returns red below 0.5", () => {
    expect(rubricBarColor(0.49)).toBe("#c62828");
    expect(rubricBarColor(0)).toBe("#c62828");
  });
});

describe("rubricPct", () => {
  it("rounds 0..1 to 0..100", () => {
    expect(rubricPct(0)).toBe(0);
    expect(rubricPct(0.5)).toBe(50);
    expect(rubricPct(0.855)).toBe(86);
    expect(rubricPct(1)).toBe(100);
  });
  it("clamps out-of-range / NaN", () => {
    expect(rubricPct(-1)).toBe(0);
    expect(rubricPct(1.5)).toBe(100);
    expect(rubricPct(Number.NaN)).toBe(0);
  });
});

describe("humanizeOutcome", () => {
  it("maps each FinalOutcome variant", () => {
    expect(humanizeOutcome("passed")).toBe("passed cleanly");
    expect(humanizeOutcome("passed_with_hints")).toBe("passed with hints");
    expect(humanizeOutcome("failed")).toBe("didn't pass yet");
    expect(humanizeOutcome("abandoned")).toBe("abandoned");
    expect(humanizeOutcome("revealed")).toBe("solution revealed");
  });
});

describe("formatExpectedGot", () => {
  it("returns 'mismatch' when both sides are undefined", () => {
    expect(formatExpectedGot(undefined, undefined)).toBe("mismatch");
  });
  it("JSON-encodes both sides into a single line", () => {
    expect(formatExpectedGot(3, 2)).toBe("expected=3 got=2");
    expect(formatExpectedGot([1, 2], [1])).toBe("expected=[1,2] got=[1]");
    expect(formatExpectedGot("a", "b")).toBe('expected="a" got="b"');
  });
});

describe("skillDeltaArrow + skillDeltaSymbol", () => {
  it("classifies positive / negative / flat deltas", () => {
    expect(skillDeltaArrow(0.1)).toBe("up");
    expect(skillDeltaArrow(-0.05)).toBe("down");
    expect(skillDeltaArrow(0)).toBe("flat");
    expect(skillDeltaArrow(0.00001)).toBe("flat");
  });
  it("renders the right glyph", () => {
    expect(skillDeltaSymbol("up")).toBe("↑");
    expect(skillDeltaSymbol("down")).toBe("↓");
    expect(skillDeltaSymbol("flat")).toBe("→");
  });
});

describe("difficultyBadgePalette", () => {
  it("returns a palette per tier and a default for unknown", () => {
    expect(difficultyBadgePalette("easy").bg).toBe("#e8f5e9");
    expect(difficultyBadgePalette("medium").fg).toBe("#827717");
    expect(difficultyBadgePalette("hard").bg).toBe("#ffe0b2");
    expect(difficultyBadgePalette("expert").fg).toBe("#b71c1c");
    expect(difficultyBadgePalette("unknown")).toEqual({ bg: "#eee", fg: "#333" });
  });
});
