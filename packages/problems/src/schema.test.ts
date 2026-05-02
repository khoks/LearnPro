import { describe, expect, it } from "vitest";
import { ProblemDefSchema, ConceptTagSchema, ProblemSlugSchema } from "./schema.js";

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
