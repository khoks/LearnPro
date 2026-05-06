import { describe, expect, it } from "vitest";
import {
  GRADE_PROMPT_VERSION,
  buildGradeAgentSystemPrompt,
  buildGradeAgentUserPrompt,
} from "./index.js";

describe("GRADE_PROMPT_VERSION", () => {
  it("is a stable, dated identifier so the grader telemetry can trace prompt edits", () => {
    expect(GRADE_PROMPT_VERSION).toMatch(/^grader-\d{4}-\d{2}-\d{2}$/);
  });

  it("does not collide with the legacy tutor-family grade prompt version tag", () => {
    expect(GRADE_PROMPT_VERSION).not.toMatch(/^tutor-/);
  });
});

describe("buildGradeAgentSystemPrompt", () => {
  const sys = buildGradeAgentSystemPrompt();

  it("names the three rubric dimensions STORY-034 calls for", () => {
    expect(sys).toContain("idiomatic");
    expect(sys).toContain("efficiency");
    expect(sys).toContain("test_coverage_thinking");
  });

  it("specifies the integer 1-5 scale (not the legacy 0-1 floats)", () => {
    expect(sys).toMatch(/1\s*-\s*5/);
    expect(sys).toMatch(/1\s*\|\s*2\s*\|\s*3\s*\|\s*4\s*\|\s*5/);
  });

  it("specifies pass / rubric / reasoning as the top-level JSON keys", () => {
    expect(sys).toContain('"pass"');
    expect(sys).toContain('"rubric"');
    expect(sys).toContain('"reasoning"');
  });

  it("instructs the grader to be cool / factual — no warm-coach phrasing", () => {
    const lower = sys.toLowerCase();
    expect(lower).toContain("cool");
    expect(lower).toContain("factual");
    expect(lower).toMatch(/never\s+say.*you/);
  });

  it("forbids second-person address so the tutor owns user-facing tone", () => {
    expect(sys.toLowerCase()).toMatch(/the submission|the code/);
  });
});

describe("buildGradeAgentUserPrompt", () => {
  it("includes the problem name, language, statement, code, and pass/total counts", () => {
    const user = buildGradeAgentUserPrompt({
      problem_name: "Two sum",
      problem_language: "python",
      problem_statement: "find indices",
      user_code: "def solve(): return [0, 1]",
      total_tests: 5,
      passed_tests: 4,
      failing_test_summaries: ["off-by-one; expected=[1,2] got=[0,1]"],
    });
    expect(user).toContain("Two sum");
    expect(user).toContain("python");
    expect(user).toContain("find indices");
    expect(user).toContain("def solve(): return [0, 1]");
    expect(user).toContain("4/5");
    expect(user).toContain("off-by-one");
  });

  it("notes 'all hidden tests passed' when there are no failing summaries", () => {
    const user = buildGradeAgentUserPrompt({
      problem_name: "Two sum",
      problem_language: "python",
      problem_statement: "find indices",
      user_code: "code",
      total_tests: 5,
      passed_tests: 5,
      failing_test_summaries: [],
    });
    expect(user).toContain("all hidden tests passed");
  });
});
