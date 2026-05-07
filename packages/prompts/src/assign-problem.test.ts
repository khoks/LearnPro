import { describe, expect, it } from "vitest";
import {
  ASSIGN_PROBLEM_PROMPT_VERSION,
  ASSIGN_PROBLEM_SYSTEM_PROMPT,
  buildAssignProblemUserPrompt,
} from "./assign-problem.js";

const FORBIDDEN_PHRASES = [
  // Coach-voice forbidden phrases — see EPIC-011 anti-dark-pattern stance.
  "DON'T LOSE",
  "lose your streak",
  "fall behind",
  "DAY ",
  "🔥",
  "⚠️",
  // STORY-042: the tutor must never accuse or moralize about honesty/cheating in the opener.
  "cheat",
  "cheating",
  "caught",
  "dishonest",
];

describe("ASSIGN_PROBLEM_SYSTEM_PROMPT — STORY-042", () => {
  it("is versioned with the v3 tag", () => {
    expect(ASSIGN_PROBLEM_PROMPT_VERSION).toBe("assign-problem-v3");
  });

  it("contains the previous_got_help walk-through phrasing", () => {
    expect(ASSIGN_PROBLEM_SYSTEM_PROMPT).toContain("previous_got_help");
    expect(ASSIGN_PROBLEM_SYSTEM_PROMPT).toContain("walk you through");
    expect(ASSIGN_PROBLEM_SYSTEM_PROMPT).toContain("own the technique");
  });

  it("does not contain dark-pattern / accusatory phrases", () => {
    for (const phrase of FORBIDDEN_PHRASES) {
      expect(ASSIGN_PROBLEM_SYSTEM_PROMPT, `forbidden: ${phrase}`).not.toContain(phrase);
    }
  });

  it("instructs the tutor to never accuse about honesty/cheating", () => {
    expect(ASSIGN_PROBLEM_SYSTEM_PROMPT.toLowerCase()).toContain("never accuse");
  });
});

describe("buildAssignProblemUserPrompt — STORY-042", () => {
  it("renders the previous_got_help flag as 'true' when the previous episode was got_help", () => {
    const out = buildAssignProblemUserPrompt({
      problem_name: "Two sum",
      problem_language: "python",
      problem_statement: "find indices",
      difficulty_tier: "easy",
      why_this_difficulty: "cold-start",
      previous_got_help: true,
    });
    expect(out).toContain("previous_got_help: true");
    expect(out).toContain("Two sum");
    expect(out).toContain("python");
    expect(out).toContain("Difficulty: easy");
  });

  it("renders the flag as 'false' on a normal next-problem", () => {
    const out = buildAssignProblemUserPrompt({
      problem_name: "Two sum",
      problem_language: "python",
      problem_statement: "find indices",
      difficulty_tier: "easy",
      why_this_difficulty: "cold-start",
      previous_got_help: false,
    });
    expect(out).toContain("previous_got_help: false");
  });
});
