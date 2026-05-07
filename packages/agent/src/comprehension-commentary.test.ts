import { describe, expect, it } from "vitest";
import {
  buildComprehensionCommentary,
  forbiddenPhrasesForCommentary,
} from "./comprehension-commentary.js";

describe("buildComprehensionCommentary (STORY-038)", () => {
  it("on correct, surfaces a warm headline and the explanation as the why", () => {
    const out = buildComprehensionCommentary({
      correct: true,
      explanation: "List comprehensions iterate, filter, then map.",
    });
    expect(out.headline.toLowerCase()).toMatch(/right|nice|correct/);
    expect(out.body).toContain("List comprehensions iterate, filter, then map.");
    expect(out.body.toLowerCase()).toMatch(/here is why|why this works/);
  });

  it("on incorrect, includes the grader reasoning + the explanation as 'what good looks like'", () => {
    const out = buildComprehensionCommentary({
      correct: false,
      explanation: "fib has overlapping subproblems, so memoization is the win.",
      grader_reasoning: "Misses the central reason — overlapping subproblems being recomputed.",
    });
    expect(out.headline.toLowerCase()).toMatch(/not quite|let.s walk/);
    expect(out.body).toContain("Misses the central reason");
    expect(out.body.toLowerCase()).toContain("what good looks like");
    expect(out.body).toContain("fib has overlapping subproblems");
  });

  it("on incorrect with fallback_used, omits the grader_reasoning (it's a placeholder)", () => {
    const out = buildComprehensionCommentary({
      correct: false,
      explanation: "Real explanation goes here.",
      grader_reasoning: "Grader produced no parsable verdict; defaulting to conservative incorrect.",
      fallback_used: true,
    });
    expect(out.body).not.toContain("Grader produced no parsable verdict");
    expect(out.body).toContain("Real explanation goes here.");
  });

  it("trims whitespace in the explanation", () => {
    const out = buildComprehensionCommentary({
      correct: true,
      explanation: "   The trick is X.   ",
    });
    expect(out.body).toContain("The trick is X.");
    expect(out.body).not.toContain("   The trick");
  });

  it("uses coach-voice copy with no forbidden phrases (correct path)", () => {
    const out = buildComprehensionCommentary({
      correct: true,
      explanation: "X happens because Y.",
    });
    const text = `${out.headline} ${out.body}`;
    for (const re of forbiddenPhrasesForCommentary()) {
      expect(text, `forbidden phrase ${re}`).not.toMatch(re);
    }
  });

  it("uses coach-voice copy with no forbidden phrases (incorrect path)", () => {
    const out = buildComprehensionCommentary({
      correct: false,
      explanation: "X happens because Y.",
      grader_reasoning: "Z is the missing piece.",
    });
    const text = `${out.headline} ${out.body}`;
    for (const re of forbiddenPhrasesForCommentary()) {
      expect(text, `forbidden phrase ${re}`).not.toMatch(re);
    }
  });

  it("never opens with shouting (no all-caps imperatives)", () => {
    const out = buildComprehensionCommentary({
      correct: false,
      explanation: "Z.",
    });
    expect(out.headline).not.toMatch(/^[A-Z]{3,}/);
  });
});
