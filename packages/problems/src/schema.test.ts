import { describe, expect, it } from "vitest";
import {
  BugArchetypeSchema,
  ConceptTagSchema,
  DebugProblemDefSchema,
  ImplementProblemDefSchema,
  ProblemDefSchema,
  ProblemKindSchema,
  ProblemSlugSchema,
  isDebugProblem,
  isImplementProblem,
} from "./schema.js";

const VALID_PROBLEM = {
  slug: "is-even",
  name: "Is even",
  language: "python",
  difficulty: 1,
  track: "python-fundamentals",
  concept_tags: ["control-flow", "modulo"],
  statement: "Return whether n is even.",
  starter_code: "def solve(n):\n    pass\n",
  reference_solution: "def solve(n):\n    return n % 2 == 0\n",
  public_examples: [{ input: 4, expected: true }],
  hidden_tests: [
    { input: 0, expected: true },
    { input: -3, expected: false },
  ],
  expected_median_time_to_solve_ms: 45_000,
} as const;

describe("ProblemDefSchema", () => {
  it("parses a valid problem", () => {
    const result = ProblemDefSchema.safeParse(VALID_PROBLEM);
    expect(result.success).toBe(true);
  });

  it("requires kebab-case slug", () => {
    const result = ProblemDefSchema.safeParse({ ...VALID_PROBLEM, slug: "Is_Even" });
    expect(result.success).toBe(false);
  });

  it("rejects empty slug", () => {
    const result = ProblemDefSchema.safeParse({ ...VALID_PROBLEM, slug: "" });
    expect(result.success).toBe(false);
  });

  it("rejects difficulty below 1", () => {
    const result = ProblemDefSchema.safeParse({ ...VALID_PROBLEM, difficulty: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects difficulty above 5", () => {
    const result = ProblemDefSchema.safeParse({ ...VALID_PROBLEM, difficulty: 6 });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer difficulty", () => {
    const result = ProblemDefSchema.safeParse({ ...VALID_PROBLEM, difficulty: 2.5 });
    expect(result.success).toBe(false);
  });

  it("rejects unknown language", () => {
    const result = ProblemDefSchema.safeParse({ ...VALID_PROBLEM, language: "rust" });
    expect(result.success).toBe(false);
  });

  it("rejects empty hidden_tests", () => {
    const result = ProblemDefSchema.safeParse({ ...VALID_PROBLEM, hidden_tests: [] });
    expect(result.success).toBe(false);
  });

  it("rejects empty public_examples", () => {
    const result = ProblemDefSchema.safeParse({ ...VALID_PROBLEM, public_examples: [] });
    expect(result.success).toBe(false);
  });

  it("rejects empty concept_tags", () => {
    const result = ProblemDefSchema.safeParse({ ...VALID_PROBLEM, concept_tags: [] });
    expect(result.success).toBe(false);
  });

  it("rejects non-kebab-case concept tag", () => {
    const result = ProblemDefSchema.safeParse({
      ...VALID_PROBLEM,
      concept_tags: ["controlFlow"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-positive expected_median_time_to_solve_ms", () => {
    const result = ProblemDefSchema.safeParse({
      ...VALID_PROBLEM,
      expected_median_time_to_solve_ms: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing reference_solution", () => {
    const { reference_solution: _ignored, ...rest } = VALID_PROBLEM;
    const result = ProblemDefSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });
});

describe("ConceptTagSchema", () => {
  it("accepts a single-letter tag", () => {
    expect(ConceptTagSchema.safeParse("a").success).toBe(true);
  });

  it("accepts multi-segment kebab-case", () => {
    expect(ConceptTagSchema.safeParse("string-manipulation").success).toBe(true);
  });

  it("rejects camelCase", () => {
    expect(ConceptTagSchema.safeParse("stringManipulation").success).toBe(false);
  });

  it("rejects trailing dash", () => {
    expect(ConceptTagSchema.safeParse("string-").success).toBe(false);
  });

  it("rejects leading digit", () => {
    expect(ConceptTagSchema.safeParse("1-thing").success).toBe(false);
  });
});

describe("ProblemSlugSchema", () => {
  it("accepts a kebab-case slug", () => {
    expect(ProblemSlugSchema.safeParse("two-sum").success).toBe(true);
  });

  it("rejects underscores", () => {
    expect(ProblemSlugSchema.safeParse("two_sum").success).toBe(false);
  });
});

// STORY-037 — discriminated union: implement vs. debug.
describe("ProblemDefSchema (STORY-037 kind discriminator)", () => {
  it("normalizes a legacy YAML without `kind` to kind=implement", () => {
    const result = ProblemDefSchema.safeParse(VALID_PROBLEM);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.kind).toBe("implement");
      expect(isImplementProblem(result.data)).toBe(true);
      expect(isDebugProblem(result.data)).toBe(false);
    }
  });

  it("accepts an explicit kind=implement", () => {
    const result = ProblemDefSchema.safeParse({ ...VALID_PROBLEM, kind: "implement" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.kind).toBe("implement");
  });

  it("accepts a debug problem with bug_archetype + expected_behavior", () => {
    const debug = {
      ...VALID_PROBLEM,
      kind: "debug",
      bug_archetype: "off_by_one",
      expected_behavior: "Return whether n is even.",
    };
    const result = ProblemDefSchema.safeParse(debug);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.kind).toBe("debug");
      expect(isDebugProblem(result.data)).toBe(true);
      if (isDebugProblem(result.data)) {
        expect(result.data.bug_archetype).toBe("off_by_one");
        expect(result.data.expected_behavior).toBe("Return whether n is even.");
      }
    }
  });

  it("rejects a debug problem missing bug_archetype", () => {
    const debug = { ...VALID_PROBLEM, kind: "debug", expected_behavior: "do the thing" };
    expect(ProblemDefSchema.safeParse(debug).success).toBe(false);
  });

  it("rejects a debug problem missing expected_behavior", () => {
    const debug = { ...VALID_PROBLEM, kind: "debug", bug_archetype: "off_by_one" };
    expect(ProblemDefSchema.safeParse(debug).success).toBe(false);
  });

  it("rejects an unknown kind value", () => {
    const result = ProblemDefSchema.safeParse({ ...VALID_PROBLEM, kind: "comprehension" });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown bug_archetype on a debug problem", () => {
    const debug = {
      ...VALID_PROBLEM,
      kind: "debug",
      bug_archetype: "fencepost_error",
      expected_behavior: "do the thing",
    };
    expect(ProblemDefSchema.safeParse(debug).success).toBe(false);
  });

  it("ImplementProblemDefSchema accepts only kind=implement", () => {
    expect(
      ImplementProblemDefSchema.safeParse({ ...VALID_PROBLEM, kind: "implement" }).success,
    ).toBe(true);
    expect(
      ImplementProblemDefSchema.safeParse({
        ...VALID_PROBLEM,
        kind: "debug",
        bug_archetype: "off_by_one",
        expected_behavior: "do the thing",
      }).success,
    ).toBe(false);
  });

  it("DebugProblemDefSchema rejects an implement-shaped object", () => {
    expect(DebugProblemDefSchema.safeParse({ ...VALID_PROBLEM, kind: "implement" }).success).toBe(
      false,
    );
  });
});

describe("BugArchetypeSchema", () => {
  it("accepts every catalogued archetype", () => {
    for (const a of [
      "off_by_one",
      "mutation_in_iteration",
      "reference_equality",
      "async_race",
      "late_binding",
      "shadowing",
      "type_coercion",
      "default_arg_mutability",
    ] as const) {
      expect(BugArchetypeSchema.safeParse(a).success).toBe(true);
    }
  });

  it("rejects free-text", () => {
    expect(BugArchetypeSchema.safeParse("misc-bug").success).toBe(false);
  });
});

describe("ProblemKindSchema", () => {
  it("accepts the two MVP kinds", () => {
    expect(ProblemKindSchema.safeParse("implement").success).toBe(true);
    expect(ProblemKindSchema.safeParse("debug").success).toBe(true);
  });

  it("rejects future-but-not-yet kinds", () => {
    expect(ProblemKindSchema.safeParse("comprehension").success).toBe(false);
  });
});
