import type { ProblemDef } from "@learnpro/problems";
import { describe, expect, it, vi } from "vitest";
import type { GradeDeps, GradeEpisodeContext, HiddenTestResult } from "../ports.js";
import { aggregatePassed, clampRubric, createGradeTool, summarizeFailingTests } from "./grade.js";
import { EpisodeNotFoundError } from "./give-hint.js";

const EPISODE_ID = "11111111-1111-4111-8111-111111111111";
const SUBMISSION_ID = "22222222-2222-4222-8222-222222222222";

function pdef(): ProblemDef {
  return {
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
}): GradeDeps & { recordedSubmissions: number; rubricMock: ReturnType<typeof vi.fn> } {
  let recordedSubmissions = 0;
  const rubricMock = vi.fn(
    async () =>
      opts.rubric ?? {
        rubric: { correctness: 1, idiomatic: 0.9, edge_case_coverage: 0.85 },
        prose_explanation: "solid solve",
      },
  );
  return {
    rubricMock,
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
});
