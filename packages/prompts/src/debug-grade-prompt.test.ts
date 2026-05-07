import { describe, expect, it } from "vitest";
import {
  DEBUG_GRADE_PROMPT_VERSION,
  buildDebugGradeSystemPrompt,
  buildDebugGradeUserPrompt,
} from "./debug-grade-prompt.js";

describe("DEBUG_GRADE_PROMPT_VERSION (STORY-037)", () => {
  it("is versioned independently from the main grader prompt", () => {
    expect(DEBUG_GRADE_PROMPT_VERSION).toMatch(/^debug-grader-/);
  });

  it("does not collide with the main grader's version tag", () => {
    expect(DEBUG_GRADE_PROMPT_VERSION).not.toMatch(/^grader-\d{4}/);
  });
});

describe("buildDebugGradeSystemPrompt", () => {
  const sys = buildDebugGradeSystemPrompt();

  it("instructs JSON output with named_bug + inferred_archetype + summary fields", () => {
    expect(sys).toContain("named_bug");
    expect(sys).toContain("inferred_archetype");
    expect(sys).toContain("reasoning_was_coherent");
    expect(sys).toContain("summary");
    expect(sys).toContain("JSON");
  });

  it("lists every catalogued archetype the discriminated union supports", () => {
    for (const a of [
      "off_by_one",
      "mutation_in_iteration",
      "reference_equality",
      "async_race",
      "late_binding",
      "shadowing",
      "type_coercion",
      "default_arg_mutability",
    ]) {
      expect(sys, `system prompt should reference ${a}`).toContain(a);
    }
  });

  it("instructs the grader to stay cool / factual — no warm-coach phrasing", () => {
    const lower = sys.toLowerCase();
    expect(lower).toContain("factual");
    expect(lower).toMatch(/never\s+say.*you/);
  });

  it("instructs the downstream tutor (not the grader) to add bedside manner", () => {
    expect(sys.toLowerCase()).toContain("downstream tutor");
  });

  it("explicitly mentions identifying the bug archetype as the rubric center", () => {
    expect(sys).toContain("named_bug");
    // The prompt must define `named_bug` rule with reference to naming or describing the
    // archetype (so the grader knows to give credit for plain-language descriptions, not just
    // the literal archetype string).
    const lower = sys.toLowerCase();
    expect(lower).toMatch(/names? the bug|describes its mechanism/);
  });
});

describe("buildDebugGradeUserPrompt", () => {
  const baseOpts = {
    problem_name: "Debug — sum 1 to n (off-by-one)",
    problem_language: "python" as const,
    expected_archetype: "off_by_one",
    expected_behavior: "Return the sum of 1..n inclusive.",
    buggy_starter: "def solve(n):\n    return sum(range(1, n))",
    user_fix: "def solve(n):\n    return sum(range(1, n + 1))",
    user_explanation: "the upper bound was exclusive, missing n itself",
  };

  it("includes problem language + name + archetype + buggy starter + user fix + explanation", () => {
    const out = buildDebugGradeUserPrompt(baseOpts);
    expect(out).toContain(baseOpts.problem_name);
    expect(out).toContain("python");
    expect(out).toContain("off_by_one");
    expect(out).toContain(baseOpts.buggy_starter);
    expect(out).toContain(baseOpts.user_fix);
    expect(out).toContain(baseOpts.user_explanation);
  });

  it("places the (none provided) sentinel when the explanation is empty", () => {
    const out = buildDebugGradeUserPrompt({ ...baseOpts, user_explanation: "   " });
    expect(out).toContain("(none provided)");
  });

  it("flags the expected archetype as ground truth (not to echo back)", () => {
    const out = buildDebugGradeUserPrompt(baseOpts);
    // Sanity: the prompt must distinguish the GROUND TRUTH archetype from the GRADER'S inference
    // — the grader is supposed to score the user, not regurgitate the answer.
    expect(out.toLowerCase()).toContain("ground truth");
  });
});
