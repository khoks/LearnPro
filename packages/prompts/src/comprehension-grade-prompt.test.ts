import { describe, expect, it } from "vitest";
import {
  COMPREHENSION_GRADE_PROMPT_VERSION,
  buildComprehensionGradeSystemPrompt,
  buildComprehensionGradeUserPrompt,
} from "./comprehension-grade-prompt.js";

describe("COMPREHENSION_GRADE_PROMPT_VERSION (STORY-038)", () => {
  it("is versioned independently from the main / debug grader prompts", () => {
    expect(COMPREHENSION_GRADE_PROMPT_VERSION).toMatch(/^comprehension-grader-/);
  });

  it("does not collide with the debug grader's version tag", () => {
    expect(COMPREHENSION_GRADE_PROMPT_VERSION).not.toMatch(/^debug-grader-/);
  });
});

describe("buildComprehensionGradeSystemPrompt", () => {
  const sys = buildComprehensionGradeSystemPrompt();

  it("instructs JSON output with correct + reasoning fields", () => {
    expect(sys).toContain("correct");
    expect(sys).toContain("reasoning");
    expect(sys).toContain("JSON");
  });

  it("instructs the grader to stay cool / factual — no warm-coach phrasing", () => {
    const lower = sys.toLowerCase();
    expect(lower).toContain("factual");
    expect(lower).toMatch(/never\s+say.*you/);
  });

  it("instructs the downstream tutor (not the grader) to add bedside manner", () => {
    expect(sys.toLowerCase()).toContain("downstream tutor");
  });

  it("centres the rubric on factual content equivalence (not phrasing match)", () => {
    const lower = sys.toLowerCase();
    expect(lower).toMatch(/same.*facts|content equivalence|same.*factual/);
    expect(lower).toMatch(/charit|phras|wording|surface/);
  });
});

describe("buildComprehensionGradeUserPrompt", () => {
  const baseOpts = {
    problem_name: "Reason — linear search complexity",
    problem_language: "python" as const,
    starter_code:
      "def contains(items, target):\n    for x in items:\n        if x == target:\n            return True\n    return False",
    question: "What is the worst-case time complexity?",
    expected_answer: "O(n) — a linear scan over items.",
    user_answer: "Linear time, since we go through the array once.",
  };

  it("includes problem name, language, code, question, expected, and user answer", () => {
    const out = buildComprehensionGradeUserPrompt(baseOpts);
    expect(out).toContain(baseOpts.problem_name);
    expect(out).toContain("python");
    expect(out).toContain(baseOpts.starter_code);
    expect(out).toContain(baseOpts.question);
    expect(out).toContain(baseOpts.expected_answer);
    expect(out).toContain(baseOpts.user_answer);
  });

  it("places the (none provided) sentinel when the user answer is empty", () => {
    const out = buildComprehensionGradeUserPrompt({ ...baseOpts, user_answer: "   " });
    expect(out).toContain("(none provided)");
  });

  it("flags the expected answer as ground truth (not to echo back)", () => {
    const out = buildComprehensionGradeUserPrompt(baseOpts);
    expect(out.toLowerCase()).toContain("ground truth");
  });
});
