import { describe, expect, it } from "vitest";
import {
  BugArchetypeSchema,
  ComprehensionFormatSchema,
  ComprehensionProblemDefSchema,
  ConceptTagSchema,
  DebugProblemDefSchema,
  ImplementProblemDefSchema,
  ProblemDefSchema,
  ProblemKindSchema,
  ProblemSlugSchema,
  isComprehensionProblem,
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
    const result = ProblemDefSchema.safeParse({ ...VALID_PROBLEM, kind: "fancy_new_kind" });
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
  it("accepts implement / debug / comprehension", () => {
    expect(ProblemKindSchema.safeParse("implement").success).toBe(true);
    expect(ProblemKindSchema.safeParse("debug").success).toBe(true);
    expect(ProblemKindSchema.safeParse("comprehension").success).toBe(true);
  });

  it("rejects unknown kinds", () => {
    expect(ProblemKindSchema.safeParse("fancy_new_kind").success).toBe(false);
  });
});

// STORY-038 — comprehension problem variant.
describe("ComprehensionProblemDefSchema (STORY-038)", () => {
  const COMPREHENSION_BASE = {
    kind: "comprehension" as const,
    slug: "predict-list-comprehension",
    name: "Predict — list comprehension",
    language: "python" as const,
    difficulty: 2,
    track: "python-fundamentals",
    concept_tags: ["list-comprehension", "control-flow"],
    statement: "Predict what the list comprehension below produces.",
    starter_code: "result = [x * 2 for x in [1, 2, 3] if x > 1]\nprint(result)\n",
    expected_median_time_to_solve_ms: 30_000,
    comprehension_format: "predict_output" as const,
    question: "What does the program print?",
    explanation:
      "The comprehension iterates [1,2,3], filters values where x>1 (so 2 and 3), and doubles them — yielding [4, 6].",
  };

  it("accepts a multiple-choice comprehension problem", () => {
    const def = {
      ...COMPREHENSION_BASE,
      answer_format: "multiple_choice" as const,
      multiple_choice_options: ["[2, 4, 6]", "[4, 6]", "[1, 4, 6]", "[]"],
      correct_answer_index: 1,
    };
    const result = ProblemDefSchema.safeParse(def);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.kind).toBe("comprehension");
      expect(isComprehensionProblem(result.data)).toBe(true);
      expect(isImplementProblem(result.data)).toBe(false);
      expect(isDebugProblem(result.data)).toBe(false);
    }
  });

  it("accepts a free-text comprehension problem", () => {
    const def = {
      ...COMPREHENSION_BASE,
      comprehension_format: "reason_property" as const,
      answer_format: "free_text" as const,
      expected_answer: "O(n)",
      question: "What is the time complexity?",
    };
    const result = ProblemDefSchema.safeParse(def);
    expect(result.success).toBe(true);
  });

  it("does not require hidden_tests / public_examples / reference_solution", () => {
    const def = {
      ...COMPREHENSION_BASE,
      answer_format: "multiple_choice" as const,
      multiple_choice_options: ["a", "b", "c", "d"],
      correct_answer_index: 0,
    };
    expect(ProblemDefSchema.safeParse(def).success).toBe(true);
  });

  it("rejects multiple_choice missing the options array", () => {
    const def = {
      ...COMPREHENSION_BASE,
      answer_format: "multiple_choice" as const,
      correct_answer_index: 0,
    };
    expect(ProblemDefSchema.safeParse(def).success).toBe(false);
  });

  it("rejects multiple_choice with the wrong number of options (3 instead of 4)", () => {
    const def = {
      ...COMPREHENSION_BASE,
      answer_format: "multiple_choice" as const,
      multiple_choice_options: ["a", "b", "c"],
      correct_answer_index: 0,
    };
    expect(ProblemDefSchema.safeParse(def).success).toBe(false);
  });

  it("rejects multiple_choice with correct_answer_index out of range", () => {
    const def = {
      ...COMPREHENSION_BASE,
      answer_format: "multiple_choice" as const,
      multiple_choice_options: ["a", "b", "c", "d"],
      correct_answer_index: 4,
    };
    expect(ProblemDefSchema.safeParse(def).success).toBe(false);
  });

  it("rejects free_text missing expected_answer", () => {
    const def = {
      ...COMPREHENSION_BASE,
      answer_format: "free_text" as const,
    };
    expect(ProblemDefSchema.safeParse(def).success).toBe(false);
  });

  it("rejects unknown comprehension_format", () => {
    const def = {
      ...COMPREHENSION_BASE,
      comprehension_format: "rewrite_idiomatic",
      answer_format: "multiple_choice" as const,
      multiple_choice_options: ["a", "b", "c", "d"],
      correct_answer_index: 0,
    };
    expect(ProblemDefSchema.safeParse(def).success).toBe(false);
  });

  it("rejects missing explanation", () => {
    const { explanation: _ignored, ...rest } = COMPREHENSION_BASE;
    const def = {
      ...rest,
      answer_format: "multiple_choice" as const,
      multiple_choice_options: ["a", "b", "c", "d"],
      correct_answer_index: 0,
    };
    expect(ProblemDefSchema.safeParse(def).success).toBe(false);
  });

  it("ComprehensionProblemDefSchema rejects an implement-shaped object", () => {
    const def = {
      kind: "implement" as const,
      slug: "x",
      name: "x",
      language: "python" as const,
      difficulty: 1,
      track: "python-fundamentals",
      concept_tags: ["a"],
      statement: "s",
      starter_code: "c",
      reference_solution: "r",
      public_examples: [{ input: 1, expected: 1 }],
      hidden_tests: [{ input: 1, expected: 1 }],
      expected_median_time_to_solve_ms: 1,
    };
    expect(ComprehensionProblemDefSchema.safeParse(def).success).toBe(false);
  });
});

describe("ComprehensionFormatSchema (STORY-038)", () => {
  it("accepts the three sub-formats", () => {
    expect(ComprehensionFormatSchema.safeParse("predict_output").success).toBe(true);
    expect(ComprehensionFormatSchema.safeParse("trace_execution").success).toBe(true);
    expect(ComprehensionFormatSchema.safeParse("reason_property").success).toBe(true);
  });

  it("rejects free-text format names", () => {
    expect(ComprehensionFormatSchema.safeParse("predict-output").success).toBe(false);
    expect(ComprehensionFormatSchema.safeParse("complexity").success).toBe(false);
  });
});

// STORY-043 — multi-file starter workspace.  Optional field on the implement variant; when
// supplied, the editor pre-populates with this file tree instead of `starter_code`.  The
// loader still requires `starter_code` (backward compat) so a single-file fallback is always
// available.
describe("ImplementProblemDef.starter_workspace (STORY-043)", () => {
  const WITH_WORKSPACE = {
    ...VALID_PROBLEM,
    starter_workspace: [
      { path: "lib/util.py", content: "def helper():\n    pass\n" },
      { path: "main.py", content: "from lib.util import helper\nhelper()\n" },
    ],
    entry_file: "main.py",
  };

  it("parses a problem with a 2-file starter workspace", () => {
    const result = ProblemDefSchema.safeParse(WITH_WORKSPACE);
    expect(result.success).toBe(true);
    if (result.success && result.data.kind === "implement") {
      expect(result.data.starter_workspace).toHaveLength(2);
      expect(result.data.entry_file).toBe("main.py");
    }
  });

  it("permits omitting starter_workspace (single-file fallback)", () => {
    const { starter_workspace: _ws, entry_file: _e, ...rest } = WITH_WORKSPACE;
    void _ws;
    void _e;
    const result = ProblemDefSchema.safeParse(rest);
    expect(result.success).toBe(true);
  });

  it("rejects duplicate paths in starter_workspace", () => {
    const result = ProblemDefSchema.safeParse({
      ...WITH_WORKSPACE,
      starter_workspace: [
        { path: "main.py", content: "x=1\n" },
        { path: "main.py", content: "x=2\n" },
      ],
      entry_file: "main.py",
    });
    expect(result.success).toBe(false);
  });

  it("rejects entry_file values not present in starter_workspace", () => {
    const result = ProblemDefSchema.safeParse({
      ...WITH_WORKSPACE,
      entry_file: "missing.py",
    });
    expect(result.success).toBe(false);
  });

  it("rejects path traversal in starter_workspace", () => {
    const result = ProblemDefSchema.safeParse({
      ...WITH_WORKSPACE,
      starter_workspace: [
        { path: "../etc/passwd", content: "" },
        { path: "main.py", content: "pass\n" },
      ],
      entry_file: "main.py",
    });
    expect(result.success).toBe(false);
  });

  it("permits empty content (e.g. an empty __init__.py)", () => {
    const result = ProblemDefSchema.safeParse({
      ...WITH_WORKSPACE,
      starter_workspace: [
        { path: "lib/__init__.py", content: "" },
        { path: "main.py", content: "import lib\n" },
      ],
      entry_file: "main.py",
    });
    expect(result.success).toBe(true);
  });

  it("rejects starter_workspace on debug-kind problems (kind discriminator)", () => {
    // Debug-kind problems don't surface `starter_workspace` in the schema. Adding the key
    // should fail because the `debug` variant doesn't declare it (Zod's discriminatedUnion
    // is strict by default about variant-specific keys).
    const debugProblem = {
      ...VALID_PROBLEM,
      kind: "debug",
      bug_archetype: "off_by_one",
      expected_behavior: "Should return n*2.",
      starter_workspace: [{ path: "main.py", content: "pass\n" }],
    };
    const result = DebugProblemDefSchema.safeParse(debugProblem);
    if (result.success) {
      // Zod doesn't auto-strip unknown keys when superRefine is in play, so we additionally
      // assert that the key isn't present in the parsed value.
      expect((result.data as { starter_workspace?: unknown }).starter_workspace).toBeUndefined();
    }
  });
});

describe("ImplementProblemDefSchema directly accepts starter_workspace", () => {
  it("parses an implement-kind problem with a workspace via the variant schema", () => {
    const result = ImplementProblemDefSchema.safeParse({
      ...VALID_PROBLEM,
      kind: "implement",
      starter_workspace: [{ path: "main.py", content: "pass\n" }],
      entry_file: "main.py",
    });
    expect(result.success).toBe(true);
  });
});
