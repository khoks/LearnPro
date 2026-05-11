import type { ProblemDef } from "@learnpro/problems";
import { describe, expect, it, vi } from "vitest";
import type {
  GradeDeps,
  GradeEpisodeContext,
  GraderAgentRubric,
  HiddenTestResult,
} from "../ports.js";
import {
  GradeInputSchema,
  aggregatePassed,
  clampRubric,
  createGradeTool,
  summarizeFailingTests,
} from "./grade.js";
import { EpisodeNotFoundError } from "./give-hint.js";

const EPISODE_ID = "11111111-1111-4111-8111-111111111111";
const SUBMISSION_ID = "22222222-2222-4222-8222-222222222222";

function pdef(): ProblemDef {
  return {
    kind: "implement",
    slug: "two-sum",
    name: "Two sum",
    language: "python",
    difficulty: 2,
    track: "python-fundamentals",
    concept_tags: ["arrays", "hash-map"],
    statement: "find indices",
    starter_code: "def solve(nums, target):\n    pass\n",
    reference_solution: "def solve(nums, target):\n    return [0, 1]\n",
    public_examples: [{ input: [[2, 7], 9], expected: [0, 1] }],
    hidden_tests: [{ input: [[2, 7], 9], expected: [0, 1] }],
    expected_median_time_to_solve_ms: 120_000,
  };
}

function fakeDeps(opts: {
  ctx?: GradeEpisodeContext | null;
  test_results?: HiddenTestResult[];
  rubric?: {
    rubric: { correctness: number; idiomatic: number; edge_case_coverage: number };
    prose_explanation: string;
  };
  // STORY-034 — when supplied, the fake wires `runGraderAgent` to return this rubric. When
  // `graderThrows` is true the wired runner raises so tests can assert best-effort swallow.
  grader?: GraderAgentRubric;
  graderThrows?: boolean;
  persistThrows?: boolean;
}): GradeDeps & {
  recordedSubmissions: number;
  rubricMock: ReturnType<typeof vi.fn>;
  graderMock: ReturnType<typeof vi.fn>;
  persistedRubrics: GraderAgentRubric[];
} {
  let recordedSubmissions = 0;
  const persistedRubrics: GraderAgentRubric[] = [];
  const rubricMock = vi.fn(
    async () =>
      opts.rubric ?? {
        rubric: { correctness: 1, idiomatic: 0.9, edge_case_coverage: 0.85 },
        prose_explanation: "solid solve",
      },
  );
  const graderMock = vi.fn(async (): Promise<GraderAgentRubric> => {
    if (opts.graderThrows) throw new Error("grader boom");
    return (
      opts.grader ?? {
        pass: true,
        rubric: { idiomatic: 4, efficiency: 4, test_coverage_thinking: 4 },
        reasoning: "Reasonable solve.",
        fallback_used: false,
      }
    );
  });
  const wireGrader = opts.grader !== undefined || opts.graderThrows === true;
  const deps: GradeDeps & {
    recordedSubmissions: number;
    rubricMock: ReturnType<typeof vi.fn>;
    graderMock: ReturnType<typeof vi.fn>;
    persistedRubrics: GraderAgentRubric[];
  } = {
    rubricMock,
    graderMock,
    persistedRubrics,
    get recordedSubmissions() {
      return recordedSubmissions;
    },
    async loadEpisodeProblem() {
      return opts.ctx === undefined
        ? {
            episode_id: EPISODE_ID,
            user_id: "user-1",
            org_id: "self",
            problem_id: "problem-1",
            problem: pdef(),
          }
        : opts.ctx;
    },
    async runHiddenTests() {
      return (
        opts.test_results ?? [
          { index: 0, passed: true },
          { index: 1, passed: true },
        ]
      );
    },
    generateRubric: rubricMock,
    async recordSubmission() {
      recordedSubmissions += 1;
      return { submission_id: SUBMISSION_ID };
    },
  };
  if (wireGrader) {
    deps.runGraderAgent = graderMock;
    deps.persistGraderRubric = async (input) => {
      if (opts.persistThrows) throw new Error("persist boom");
      persistedRubrics.push(input.rubric);
    };
  }
  return deps;
}

describe("aggregatePassed", () => {
  it("passed=true only when all results passed", () => {
    expect(aggregatePassed([{ index: 0, passed: true }])).toEqual({
      passed: true,
      passed_count: 1,
      total: 1,
    });
    expect(
      aggregatePassed([
        { index: 0, passed: true },
        { index: 1, passed: false },
      ]),
    ).toEqual({ passed: false, passed_count: 1, total: 2 });
  });

  it("passed=false when there are no tests", () => {
    expect(aggregatePassed([])).toEqual({ passed: false, passed_count: 0, total: 0 });
  });
});

describe("summarizeFailingTests", () => {
  it("only includes failing tests, capped at 3", () => {
    const summaries = summarizeFailingTests([
      { index: 0, passed: true },
      { index: 1, passed: false, expected: 1, got: 2, detail: "mismatch" },
      { index: 2, passed: false, expected: 3, got: 4 },
      { index: 3, passed: false, expected: 5, got: 6 },
      { index: 4, passed: false, expected: 7, got: 8 },
    ]);
    expect(summaries).toHaveLength(3);
    expect(summaries[0]).toContain("mismatch");
  });
});

describe("clampRubric", () => {
  it("clamps to 0-1 and defaults missing fields to 0", () => {
    expect(clampRubric({ correctness: 1.4, idiomatic: -0.2 })).toEqual({
      correctness: 1,
      idiomatic: 0,
      edge_case_coverage: 0,
    });
  });
});

describe("createGradeTool", () => {
  it("validates input via Zod (rejects empty code)", async () => {
    const deps = fakeDeps({});
    const tool = createGradeTool({ deps });
    await expect(tool.run({ episode_id: EPISODE_ID, code: "" })).rejects.toThrow();
  });

  it("happy path: all tests pass → passed=true, rubric returned, submission recorded", async () => {
    const deps = fakeDeps({});
    const tool = createGradeTool({ deps });
    const out = await tool.run({
      episode_id: EPISODE_ID,
      code: "def solve(nums, target):\n    return [0, 1]\n",
    });
    expect(out.passed).toBe(true);
    expect(out.rubric.correctness).toBe(1);
    expect(out.submission_id).toBe(SUBMISSION_ID);
    expect(deps.recordedSubmissions).toBe(1);
  });

  it("failing-tests path: passed=false, hidden_test_results carry details", async () => {
    const deps = fakeDeps({
      test_results: [
        { index: 0, passed: true },
        { index: 1, passed: false, expected: 1, got: 2, detail: "mismatch" },
      ],
      rubric: {
        rubric: { correctness: 0.5, idiomatic: 0.7, edge_case_coverage: 0.3 },
        prose_explanation: "off-by-one on duplicates",
      },
    });
    const tool = createGradeTool({ deps });
    const out = await tool.run({
      episode_id: EPISODE_ID,
      code: "def solve(nums, target):\n    return [0, 0]\n",
    });
    expect(out.passed).toBe(false);
    expect(out.hidden_test_results[1]?.detail).toBe("mismatch");
    expect(out.rubric.correctness).toBe(0.5);
    expect(out.prose_explanation).toContain("duplicates");
  });

  it("throws EpisodeNotFoundError when episode missing", async () => {
    const deps = fakeDeps({ ctx: null });
    const tool = createGradeTool({ deps });
    await expect(tool.run({ episode_id: EPISODE_ID, code: "x" })).rejects.toBeInstanceOf(
      EpisodeNotFoundError,
    );
  });

  it("calls the rubric generator even when all hidden tests pass (idiomatic / edge-case feedback)", async () => {
    const deps = fakeDeps({});
    const tool = createGradeTool({ deps });
    await tool.run({ episode_id: EPISODE_ID, code: "def solve(): pass" });
    expect(deps.rubricMock).toHaveBeenCalledTimes(1);
  });

  it("STORY-034: when grader is wired, runs it AFTER tests-as-floor + AFTER unified rubric", async () => {
    const grader: GraderAgentRubric = {
      pass: true,
      rubric: { idiomatic: 5, efficiency: 4, test_coverage_thinking: 3 },
      reasoning: "Hash-map solve.",
      fallback_used: false,
    };
    const deps = fakeDeps({ grader });
    const tool = createGradeTool({ deps });
    const out = await tool.run({ episode_id: EPISODE_ID, code: "def solve(): return [0,1]" });

    expect(deps.graderMock).toHaveBeenCalledTimes(1);
    expect(out.grader).toEqual(grader);
    // Grader receives the test_results from the upstream check.
    const callArg = deps.graderMock.mock.calls[0]?.[0] as
      | { test_results: HiddenTestResult[] }
      | undefined;
    expect(callArg?.test_results).toHaveLength(2);
    // Persistence happened with the same rubric.
    expect(deps.persistedRubrics).toHaveLength(1);
    expect(deps.persistedRubrics[0]).toEqual(grader);
  });

  it("STORY-034: grader output is null when the deps don't wire it (legacy unified-tutor codepath)", async () => {
    const deps = fakeDeps({});
    const tool = createGradeTool({ deps });
    const out = await tool.run({ episode_id: EPISODE_ID, code: "def solve(): return [0,1]" });
    expect(out.grader ?? null).toBeNull();
  });

  it("STORY-034: grader hiccup → grader=null, submission still records (best-effort)", async () => {
    const deps = fakeDeps({ graderThrows: true });
    const tool = createGradeTool({ deps });
    const out = await tool.run({ episode_id: EPISODE_ID, code: "def solve(): return [0,1]" });
    expect(out.grader ?? null).toBeNull();
    expect(deps.recordedSubmissions).toBe(1);
  });

  it("STORY-034: rubric persistence hiccup doesn't fail the close", async () => {
    const grader: GraderAgentRubric = {
      pass: true,
      rubric: { idiomatic: 4, efficiency: 4, test_coverage_thinking: 4 },
      reasoning: "ok",
      fallback_used: false,
    };
    const deps = fakeDeps({ grader, persistThrows: true });
    const tool = createGradeTool({ deps });
    const out = await tool.run({ episode_id: EPISODE_ID, code: "def solve(): return [0,1]" });
    expect(out.grader).toEqual(grader);
    expect(deps.recordedSubmissions).toBe(1);
  });
});

// STORY-038a — comprehension dispatch fan-out. The grade tool now detects
// `episode.problem.kind === "comprehension"` and routes to `gradeComprehension` via the
// optional `comprehensionDeps` instead of running hidden tests. Implement+debug episodes
// continue to take the existing path; comprehension episodes don't run hidden tests at all.
import { ComprehensionDepsNotWiredError, GradeInputShapeMismatchError } from "./grade.js";
import type { ComprehensionGradeDeps, ComprehensionProblemDefShape } from "../ports.js";

function comprehensionMcProblem(): ComprehensionProblemDefShape & {
  // Adapter shape mirrors @learnpro/problems' ComprehensionProblemDef structurally.
  // The grade tool reads only what it forwards to gradeComprehensionAnswer.
  slug: string;
} {
  return {
    kind: "comprehension",
    slug: "comp-mc",
    name: "Predict the output",
    language: "python",
    comprehension_format: "predict_output",
    question: "What does the program print?",
    answer_format: "multiple_choice",
    multiple_choice_options: ["[0, 2, 4]", "[2, 4]", "[0, 4]", "[1, 3]"],
    correct_answer_index: 0,
    explanation: "range(3) yields 0..2; doubling gives [0, 2, 4].",
    starter_code: "result = [x*2 for x in range(3)]\nprint(result)\n",
    concept_tags: ["list-comprehension"],
    difficulty: 2,
  };
}

function comprehensionFreeProblem(): ComprehensionProblemDefShape {
  return {
    kind: "comprehension",
    slug: "comp-ft",
    name: "Why slow?",
    language: "python",
    comprehension_format: "reason_property",
    question: "Why is fib slow?",
    answer_format: "free_text",
    expected_answer: "exponential overlapping subproblems",
    explanation: "Naive recursion has O(2^n) overlapping subproblems.",
    starter_code: "def fib(n): return n if n < 2 else fib(n-1) + fib(n-2)",
    concept_tags: ["complexity"],
    difficulty: 3,
  };
}

describe("createGradeTool: STORY-038a comprehension dispatch", () => {
  it("routes multiple-choice answers through comprehensionDeps and returns the verdict", async () => {
    const baseDeps = fakeDeps({
      ctx: {
        episode_id: EPISODE_ID,
        user_id: "user-1",
        org_id: "self",
        problem_id: "problem-1",
        // Cast through unknown — comprehension problems aren't a valid ProblemDef in the
        // implement+debug union from @learnpro/problems. The deps adapter accepts the
        // structural shape regardless; the grade tool's runtime check on
        // `ctx.problem.kind === "comprehension"` is what matters.
        problem: comprehensionMcProblem() as never,
      },
    });
    const compMock = vi.fn(async () => ({
      correct: true,
      reasoning: "range(3) is 0..2 → doubled = [0, 2, 4].",
      explanation: "range(3) yields 0..2; doubling gives [0, 2, 4].",
      fallback_used: false,
    }));
    const compDeps: ComprehensionGradeDeps = { gradeComprehensionAnswer: compMock };
    const tool = createGradeTool({ deps: baseDeps, comprehensionDeps: compDeps });
    const out = await tool.run({
      episode_id: EPISODE_ID,
      comprehension_answer: { kind: "multiple_choice", selected_index: 0 },
    });

    expect(compMock).toHaveBeenCalledTimes(1);
    expect(out.passed).toBe(true);
    expect(out.comprehension).toEqual({
      correct: true,
      reasoning: "range(3) is 0..2 → doubled = [0, 2, 4].",
      explanation: "range(3) yields 0..2; doubling gives [0, 2, 4].",
      fallback_used: false,
    });
    // No hidden tests on a comprehension episode.
    expect(out.hidden_test_results).toEqual([]);
    // The submission row records a JSON-serialized comprehension answer for the audit trail.
    expect(baseDeps.recordedSubmissions).toBe(1);
  });

  it("routes free-text answers through comprehensionDeps + flips fallback_used through", async () => {
    const baseDeps = fakeDeps({
      ctx: {
        episode_id: EPISODE_ID,
        user_id: "user-1",
        org_id: "self",
        problem_id: "problem-2",
        problem: comprehensionFreeProblem() as never,
      },
    });
    const compDeps: ComprehensionGradeDeps = {
      gradeComprehensionAnswer: async () => ({
        correct: false,
        reasoning: "Grader produced no parsable verdict.",
        explanation: "Naive recursion has O(2^n) overlapping subproblems.",
        fallback_used: true,
      }),
    };
    const tool = createGradeTool({ deps: baseDeps, comprehensionDeps: compDeps });
    const out = await tool.run({
      episode_id: EPISODE_ID,
      comprehension_answer: { kind: "free_text", text: "I'm not sure." },
    });
    expect(out.passed).toBe(false);
    expect(out.comprehension?.fallback_used).toBe(true);
  });

  it("throws ComprehensionDepsNotWiredError when the deps aren't configured", async () => {
    const baseDeps = fakeDeps({
      ctx: {
        episode_id: EPISODE_ID,
        user_id: "user-1",
        org_id: "self",
        problem_id: "problem-3",
        problem: comprehensionMcProblem() as never,
      },
    });
    const tool = createGradeTool({ deps: baseDeps });
    await expect(
      tool.run({
        episode_id: EPISODE_ID,
        comprehension_answer: { kind: "multiple_choice", selected_index: 0 },
      }),
    ).rejects.toBeInstanceOf(ComprehensionDepsNotWiredError);
  });

  it("throws GradeInputShapeMismatchError when comprehension episode is sent `code`", async () => {
    const baseDeps = fakeDeps({
      ctx: {
        episode_id: EPISODE_ID,
        user_id: "user-1",
        org_id: "self",
        problem_id: "problem-4",
        problem: comprehensionMcProblem() as never,
      },
    });
    const compDeps: ComprehensionGradeDeps = {
      gradeComprehensionAnswer: async () => ({
        correct: true,
        reasoning: "ok",
        explanation: "ok",
        fallback_used: false,
      }),
    };
    const tool = createGradeTool({ deps: baseDeps, comprehensionDeps: compDeps });
    await expect(tool.run({ episode_id: EPISODE_ID, code: "print('hi')" })).rejects.toBeInstanceOf(
      GradeInputShapeMismatchError,
    );
  });

  it("throws GradeInputShapeMismatchError when implement episode is sent `comprehension_answer`", async () => {
    const baseDeps = fakeDeps({});
    const compDeps: ComprehensionGradeDeps = {
      gradeComprehensionAnswer: async () => ({
        correct: true,
        reasoning: "ok",
        explanation: "ok",
        fallback_used: false,
      }),
    };
    const tool = createGradeTool({ deps: baseDeps, comprehensionDeps: compDeps });
    await expect(
      tool.run({
        episode_id: EPISODE_ID,
        comprehension_answer: { kind: "multiple_choice", selected_index: 0 },
      }),
    ).rejects.toBeInstanceOf(GradeInputShapeMismatchError);
  });

  it("implement episode keeps the existing hidden-tests path; comprehension is null on output", async () => {
    const deps = fakeDeps({});
    const tool = createGradeTool({ deps });
    const out = await tool.run({
      episode_id: EPISODE_ID,
      code: "def solve(): return [0, 1]",
    });
    // Comprehension is null on implement episodes (and absent in legacy tests pre-038a).
    expect(out.comprehension ?? null).toBeNull();
    // Hidden tests still run.
    expect(out.hidden_test_results.length).toBeGreaterThan(0);
  });
});

// STORY-043a — multi-file grade-tool harness. The grade tool accepts a `{ files: [...] }` body
// for multi-file submissions, picks the entry file by problem.entry_file (or per-language
// convention), and forwards the auxiliary files to the runHiddenTests adapter via `user_files`.
// The legacy single-file `{ code }` shape continues to work unchanged.
function multiFilePdef(): Extract<ProblemDef, { kind: "implement" }> {
  return {
    kind: "implement",
    slug: "workspace-test",
    name: "Workspace test",
    language: "python",
    difficulty: 3,
    track: "python-fundamentals",
    concept_tags: ["modules"],
    statement: "import a helper",
    starter_code: "from lib.utils import square\n\n\ndef solve(n):\n    pass\n",
    starter_workspace: [
      { path: "lib/__init__.py", content: "" },
      { path: "lib/utils.py", content: "def square(n):\n    return n * n\n" },
      { path: "main.py", content: "from lib.utils import square\n\n\ndef solve(n):\n    pass\n" },
    ],
    entry_file: "main.py",
    reference_solution:
      "from lib.utils import square\n\n\ndef solve(n):\n    return square(n) + 1\n",
    public_examples: [{ input: [3], expected: 10 }],
    hidden_tests: [{ input: [3], expected: 10 }],
    expected_median_time_to_solve_ms: 240_000,
  };
}

describe("createGradeTool: STORY-043a multi-file submissions", () => {
  it("accepts a `{ files }` body alongside the legacy `{ code }`", () => {
    expect(() =>
      GradeInputSchema.parse({
        episode_id: EPISODE_ID,
        files: [{ path: "main.py", content: "print('hi')" }],
      }),
    ).not.toThrow();
    expect(() =>
      GradeInputSchema.parse({
        episode_id: EPISODE_ID,
        code: "print('hi')",
      }),
    ).not.toThrow();
  });

  it("rejects a `{ files: [] }` body (must have at least one file)", () => {
    expect(() =>
      GradeInputSchema.parse({
        episode_id: EPISODE_ID,
        files: [],
      }),
    ).toThrow();
  });

  it("rejects file paths with .. traversal", () => {
    expect(() =>
      GradeInputSchema.parse({
        episode_id: EPISODE_ID,
        files: [{ path: "../etc/passwd", content: "x" }],
      }),
    ).toThrow();
  });

  it("forwards `user_files` to runHiddenTests when the problem has starter_workspace", async () => {
    const userFiles = [
      { path: "lib/__init__.py", content: "" },
      { path: "lib/utils.py", content: "def square(n):\n    return n * n + 1\n" },
      {
        path: "main.py",
        content: "from lib.utils import square\n\n\ndef solve(n):\n    return square(n) + 1\n",
      },
    ];
    const runHiddenTestsCalls: Array<{
      user_code: string;
      user_files?: ReadonlyArray<{ path: string; content: string }>;
    }> = [];
    const baseDeps = fakeDeps({
      ctx: {
        episode_id: EPISODE_ID,
        user_id: "user-1",
        org_id: "self",
        problem_id: "problem-1",
        problem: multiFilePdef(),
      },
    });
    const deps: GradeDeps = {
      ...baseDeps,
      async runHiddenTests(input) {
        runHiddenTestsCalls.push({
          user_code: input.user_code,
          user_files: input.user_files,
        });
        return [{ index: 0, passed: true }];
      },
    };
    const tool = createGradeTool({ deps });
    const out = await tool.run({ episode_id: EPISODE_ID, files: userFiles });

    expect(runHiddenTestsCalls).toHaveLength(1);
    expect(runHiddenTestsCalls[0]?.user_files).toBeDefined();
    expect(runHiddenTestsCalls[0]?.user_files).toHaveLength(3);
    // The user_code passed to runHiddenTests is the entry file's content (so the rubric LLM
    // and the grader agent see it as the canonical solver).
    expect(runHiddenTestsCalls[0]?.user_code).toContain("return square(n) + 1");
    expect(out.passed).toBe(true);
  });

  it("falls back to single-file `user_code` for problems without starter_workspace", async () => {
    const runHiddenTestsCalls: Array<{
      user_code: string;
      user_files?: ReadonlyArray<{ path: string; content: string }>;
    }> = [];
    const baseDeps = fakeDeps({});
    const deps: GradeDeps = {
      ...baseDeps,
      async runHiddenTests(input) {
        runHiddenTestsCalls.push({
          user_code: input.user_code,
          user_files: input.user_files,
        });
        return [{ index: 0, passed: true }];
      },
    };
    const tool = createGradeTool({ deps });
    await tool.run({ episode_id: EPISODE_ID, code: "def solve(): return [0,1]" });

    // Legacy single-file path: user_files NOT supplied.
    expect(runHiddenTestsCalls).toHaveLength(1);
    expect(runHiddenTestsCalls[0]?.user_files).toBeUndefined();
    expect(runHiddenTestsCalls[0]?.user_code).toBe("def solve(): return [0,1]");
  });

  it("honors problem.entry_file when picking the entry-file content", async () => {
    const baseDeps = fakeDeps({
      ctx: {
        episode_id: EPISODE_ID,
        user_id: "user-1",
        org_id: "self",
        problem_id: "problem-1",
        problem: { ...multiFilePdef(), entry_file: "main.py" },
      },
    });
    let capturedUserCode: string | null = null;
    const deps: GradeDeps = {
      ...baseDeps,
      async runHiddenTests(input) {
        capturedUserCode = input.user_code;
        return [{ index: 0, passed: true }];
      },
    };
    const tool = createGradeTool({ deps });
    await tool.run({
      episode_id: EPISODE_ID,
      files: [
        { path: "lib/utils.py", content: "def square(n):\n    return n * n\n" },
        {
          path: "main.py",
          content: "from lib.utils import square\ndef solve(n):\n    return square(n) + 1",
        },
      ],
    });
    expect(capturedUserCode).not.toBeNull();
    expect(capturedUserCode!).toContain("from lib.utils import square");
    expect(capturedUserCode!).toContain("return square(n) + 1");
  });

  it("falls back to per-language convention (main.py / index.ts) when entry_file is unset", async () => {
    const probWithoutEntry = (() => {
      const p = multiFilePdef();
      const noEntry: ProblemDef = {
        ...p,
        entry_file: undefined,
      };
      return noEntry;
    })();
    const baseDeps = fakeDeps({
      ctx: {
        episode_id: EPISODE_ID,
        user_id: "user-1",
        org_id: "self",
        problem_id: "problem-1",
        problem: probWithoutEntry,
      },
    });
    let capturedUserCode: string | null = null;
    const deps: GradeDeps = {
      ...baseDeps,
      async runHiddenTests(input) {
        capturedUserCode = input.user_code;
        return [{ index: 0, passed: true }];
      },
    };
    const tool = createGradeTool({ deps });
    await tool.run({
      episode_id: EPISODE_ID,
      files: [
        { path: "lib/utils.py", content: "def square(n):\n    return 0\n" },
        { path: "main.py", content: "def solve(n):\n    return 42" },
      ],
    });
    // Picked main.py via per-language fallback (python).
    expect(capturedUserCode).toBe("def solve(n):\n    return 42");
  });

  it("throws GradeInputShapeMismatchError when the entry file is missing from `files`", async () => {
    const baseDeps = fakeDeps({
      ctx: {
        episode_id: EPISODE_ID,
        user_id: "user-1",
        org_id: "self",
        problem_id: "problem-1",
        problem: { ...multiFilePdef(), entry_file: "main.py" },
      },
    });
    const tool = createGradeTool({ deps: baseDeps });
    await expect(
      tool.run({
        episode_id: EPISODE_ID,
        files: [
          { path: "lib/utils.py", content: "def square(n):\n    return n*n" },
          { path: "other.py", content: "x = 1" },
        ],
      }),
    ).rejects.toBeInstanceOf(GradeInputShapeMismatchError);
  });

  it("persists the multi-file submission as a JSON blob (audit trail / data export)", async () => {
    const recorded: Array<{ code: string; passed: boolean }> = [];
    const baseDeps = fakeDeps({
      ctx: {
        episode_id: EPISODE_ID,
        user_id: "user-1",
        org_id: "self",
        problem_id: "problem-1",
        problem: multiFilePdef(),
      },
    });
    const deps: GradeDeps = {
      ...baseDeps,
      async runHiddenTests() {
        return [{ index: 0, passed: true }];
      },
      async recordSubmission(input) {
        recorded.push({ code: input.code, passed: input.passed });
        return { submission_id: SUBMISSION_ID };
      },
    };
    const tool = createGradeTool({ deps });
    await tool.run({
      episode_id: EPISODE_ID,
      files: [
        { path: "lib/utils.py", content: "def square(n):\n    return n*n" },
        { path: "main.py", content: "def solve(n):\n    return 42" },
      ],
    });
    expect(recorded).toHaveLength(1);
    const parsed = JSON.parse(recorded[0]!.code) as {
      kind: string;
      entry_file: string;
      files: Array<{ path: string; content: string }>;
    };
    expect(parsed.kind).toBe("multi_file_submission");
    expect(parsed.entry_file).toBe("main.py");
    expect(parsed.files).toHaveLength(2);
    expect(parsed.files.map((f) => f.path).sort()).toEqual(["lib/utils.py", "main.py"]);
  });

  it("single-file submissions still persist the raw source string (no behavioural change)", async () => {
    const recorded: Array<{ code: string }> = [];
    const baseDeps = fakeDeps({});
    const deps: GradeDeps = {
      ...baseDeps,
      async runHiddenTests() {
        return [{ index: 0, passed: true }];
      },
      async recordSubmission(input) {
        recorded.push({ code: input.code });
        return { submission_id: SUBMISSION_ID };
      },
    };
    const tool = createGradeTool({ deps });
    await tool.run({ episode_id: EPISODE_ID, code: "def solve(): return [0,1]" });
    expect(recorded).toHaveLength(1);
    expect(recorded[0]!.code).toBe("def solve(): return [0,1]");
  });
});
