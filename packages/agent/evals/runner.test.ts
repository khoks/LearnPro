import { describe, expect, it, vi } from "vitest";
import type {
  CompleteRequest,
  CompleteResponse,
  EmbedRequest,
  EmbedResponse,
  LLMProvider,
  StreamChunk,
  ToolCallRequest,
  ToolCallResponse,
} from "@learnpro/llm";
import {
  aggregatePerCategory,
  aggregatePerTag,
  checkJsonShape,
  diffReports,
  parseJudgeResponse,
  renderReportMarkdown,
  runEvals,
  scanExplicitFailures,
} from "./runner.js";
import { loadAllEvalCases } from "./loader.js";
import { EVAL_REPORT_VERSION, type CaseResult, type EvalCase, type EvalReport } from "./types.js";

function makeFakeLLM(handler: (req: CompleteRequest) => string): LLMProvider {
  return {
    name: "fake",
    async complete(req: CompleteRequest): Promise<CompleteResponse> {
      return {
        text: handler(req),
        model: req.model ?? "fake-model",
        finish_reason: "end_turn",
        usage: { input_tokens: 50, output_tokens: 30 },
      };
    },
    stream(): AsyncIterable<StreamChunk> {
      throw new Error("not implemented");
    },
    async embed(_req: EmbedRequest): Promise<EmbedResponse> {
      throw new Error("not implemented");
    },
    async toolCall(_req: ToolCallRequest): Promise<ToolCallResponse> {
      throw new Error("not implemented");
    },
  };
}

const SILENT = (): void => undefined;

describe("scanExplicitFailures", () => {
  it("returns empty array when no patterns match", () => {
    const hits = scanExplicitFailures("a perfectly normal hint about the loop invariant", [
      { type: "regex", pattern: "(?i)the answer is\\s+", message: "answer leak" },
    ]);
    expect(hits).toEqual([]);
  });

  it("returns one hit per matching pattern", () => {
    const hits = scanExplicitFailures("Great work! the answer is 42", [
      { type: "regex", pattern: "(?i)the answer is\\s+", message: "answer leak" },
      { type: "regex", pattern: "(?i)great\\s+(work|job|attempt)", message: "praise" },
    ]);
    expect(hits.map((h) => h.message)).toEqual(["answer leak", "praise"]);
  });

  it("flags an invalid regex literal without crashing", () => {
    const hits = scanExplicitFailures("anything", [
      { type: "regex", pattern: "(?<=", message: "lookbehind invalid" },
    ]);
    expect(hits[0]?.message).toMatch(/Invalid regex/);
  });
});

describe("checkJsonShape", () => {
  it("hint category always passes (free-form text)", () => {
    expect(checkJsonShape("hint", "any free-form text")).toBe(true);
  });

  it("grade requires rubric.correctness/idiomatic/edge_case_coverage in [0,1] + prose", () => {
    const ok = checkJsonShape(
      "grade",
      JSON.stringify({
        rubric: { correctness: 1, idiomatic: 0.8, edge_case_coverage: 0.7 },
        prose_explanation: "fine",
      }),
    );
    expect(ok).toBe(true);
    expect(checkJsonShape("grade", JSON.stringify({ rubric: {} }))).toBe(false);
  });

  it("onboarding requires assistant_message string + done boolean", () => {
    expect(
      checkJsonShape(
        "onboarding",
        JSON.stringify({ assistant_message: "ok", done: false, captured: {} }),
      ),
    ).toBe(true);
    expect(checkJsonShape("onboarding", JSON.stringify({ assistant_message: "ok" }))).toBe(false);
  });

  it("session-plan requires items array of length 3..5 with valid shape", () => {
    const items = [
      { slug: "a", objective: "x", estimated_duration_min: 5 },
      { slug: "b", objective: "x", estimated_duration_min: 5 },
      { slug: "c", objective: "x", estimated_duration_min: 5 },
    ];
    expect(checkJsonShape("session-plan", JSON.stringify({ items }))).toBe(true);
    expect(checkJsonShape("session-plan", JSON.stringify({ items: items.slice(0, 2) }))).toBe(
      false,
    );
  });

  it("strips ```json fences before parsing", () => {
    const wrapped =
      "```json\n" +
      JSON.stringify({
        rubric: { correctness: 1, idiomatic: 0.8, edge_case_coverage: 0.7 },
        prose_explanation: "ok",
      }) +
      "\n```";
    expect(checkJsonShape("grade", wrapped)).toBe(true);
  });
});

describe("parseJudgeResponse", () => {
  it("parses a clean { passed, reasoning } response", () => {
    const j = parseJudgeResponse("should-x", JSON.stringify({ passed: true, reasoning: "ok" }));
    expect(j).toEqual({ tag: "should-x", passed: true, reasoning: "ok" });
  });

  it("fails the tag with explanatory reasoning when judge returns garbage", () => {
    const j = parseJudgeResponse("should-x", "not json at all");
    expect(j.passed).toBe(false);
    expect(j.reasoning).toMatch(/non-JSON/);
  });

  it("fails the tag when judge JSON is missing the passed boolean", () => {
    const j = parseJudgeResponse("should-x", JSON.stringify({ reasoning: "no passed key" }));
    expect(j.passed).toBe(false);
  });
});

describe("runEvals", () => {
  it("runs the pipeline end-to-end with mocked LLM (deterministic happy path)", async () => {
    const cases = await loadAllEvalCases();
    const hintCase = cases.find((c) => c.id === "hint-rung-1-conceptual-respects-rung")!;
    expect(hintCase).toBeDefined();

    // Fake LLM emits one response for the prompt-under-test, then judge calls.
    const llm = makeFakeLLM((req) => {
      const isJudge = (req.system ?? "").startsWith("You are an evaluation judge");
      if (isJudge) return JSON.stringify({ passed: true, reasoning: "looks good" });
      return "Consider what data structure would let you look up complements quickly as you scan.";
    });

    const report = await runEvals({
      llm,
      cases: [hintCase],
      onProgress: SILENT,
      now: () => 1700000000000,
    });

    expect(report.version).toBe(EVAL_REPORT_VERSION);
    expect(report.total_cases).toBe(1);
    expect(report.passed_cases).toBe(1);
    expect(report.cases[0]?.passed).toBe(true);
    expect(report.cases[0]?.tag_judgments.length).toBe(hintCase.expected_behavior_tags.length);
    expect(report.per_category.find((c) => c.category === "hint")?.pass_rate).toBe(1);
  });

  it("fails fast on explicit_failure_pattern hit (skips judge)", async () => {
    const cases = await loadAllEvalCases();
    const hintCase = cases.find((c) => c.id === "hint-rung-1-conceptual-respects-rung")!;

    const judgeSpy = vi.fn(() => JSON.stringify({ passed: true, reasoning: "n/a" }));
    const llm = makeFakeLLM((req) => {
      const isJudge = (req.system ?? "").startsWith("You are an evaluation judge");
      if (isJudge) return judgeSpy();
      // Includes a forbidden code-block marker — the rung-1 explicit_failure_pattern.
      return "```python\n# revealing answer\n```";
    });

    const report = await runEvals({
      llm,
      cases: [hintCase],
      onProgress: SILENT,
      now: () => 1700000000000,
    });

    expect(report.cases[0]?.passed).toBe(false);
    expect(report.cases[0]?.explicit_failure_hits.length).toBeGreaterThan(0);
    expect(report.cases[0]?.tag_judgments.length).toBe(0);
    expect(judgeSpy).not.toHaveBeenCalled();
  });

  it("fails when the judge marks any tag as not-passed", async () => {
    const cases = await loadAllEvalCases();
    const hintCase = cases.find((c) => c.id === "hint-rung-1-conceptual-respects-rung")!;

    let judgeCallIndex = 0;
    const llm = makeFakeLLM((req) => {
      const isJudge = (req.system ?? "").startsWith("You are an evaluation judge");
      if (isJudge) {
        // First tag fails; the rest pass. Aggregate is fail.
        const passed = judgeCallIndex !== 0;
        judgeCallIndex += 1;
        return JSON.stringify({ passed, reasoning: passed ? "ok" : "missed the mark" });
      }
      return "Think about what invariant the loop might preserve.";
    });

    const report = await runEvals({
      llm,
      cases: [hintCase],
      onProgress: SILENT,
      now: () => 1700000000000,
    });

    expect(report.cases[0]?.passed).toBe(false);
    expect(report.cases[0]?.tag_judgments[0]?.passed).toBe(false);
    expect(report.cases[0]?.tag_judgments.slice(1).every((j) => j.passed)).toBe(true);
  });

  it("respects the category filter", async () => {
    const cases = await loadAllEvalCases();
    const llm = makeFakeLLM((req) => {
      const isJudge = (req.system ?? "").startsWith("You are an evaluation judge");
      if (isJudge) return JSON.stringify({ passed: true, reasoning: "ok" });
      // Default response for every category — judge passes everything either way.
      return JSON.stringify({
        rubric: { correctness: 1, idiomatic: 0.9, edge_case_coverage: 0.8 },
        prose_explanation: "ok",
        assistant_message: "ok",
        done: false,
        captured: {},
        items: [
          { slug: "a", objective: "x", estimated_duration_min: 3 },
          { slug: "b", objective: "x", estimated_duration_min: 3 },
          { slug: "c", objective: "x", estimated_duration_min: 3 },
        ],
      });
    });

    const report = await runEvals({
      llm,
      cases,
      filter: "hint",
      onProgress: SILENT,
      now: () => 1700000000000,
    });

    const hintCount = cases.filter((c) => c.category === "hint").length;
    expect(report.total_cases).toBe(hintCount);
    expect(report.cases.every((c) => c.category === "hint")).toBe(true);
    expect(report.filter).toBe("hint");
  });

  it("reports per-tag aggregates summed across cases", async () => {
    const cases = await loadAllEvalCases();
    const subset = cases.filter((c) => c.category === "hint").slice(0, 2);

    const llm = makeFakeLLM((req) => {
      const isJudge = (req.system ?? "").startsWith("You are an evaluation judge");
      if (isJudge) return JSON.stringify({ passed: true, reasoning: "ok" });
      return "Consider invariants on the indices i and j.";
    });

    const report = await runEvals({
      llm,
      cases: subset,
      onProgress: SILENT,
      now: () => 1700000000000,
    });
    const tagsThatPassedTwice = report.per_tag.filter((t) => t.total === 2 && t.passed === 2);
    expect(tagsThatPassedTwice.length).toBeGreaterThan(0);
  });
});

describe("aggregatePerCategory + aggregatePerTag", () => {
  it("only includes categories with at least one case run", () => {
    const r: CaseResult[] = [
      mkCaseResult({ id: "a", category: "hint", passed: true }),
      mkCaseResult({ id: "b", category: "hint", passed: false }),
    ];
    const cats = aggregatePerCategory(r);
    expect(cats).toEqual([{ category: "hint", total: 2, passed: 1, pass_rate: 0.5 }]);
  });

  it("aggregates per-tag judgments correctly across cases", () => {
    const r: CaseResult[] = [
      mkCaseResult({
        id: "a",
        category: "hint",
        passed: true,
        tags: [
          { tag: "should-x", passed: true, reasoning: "" },
          { tag: "should-y", passed: false, reasoning: "" },
        ],
      }),
      mkCaseResult({
        id: "b",
        category: "hint",
        passed: false,
        tags: [
          { tag: "should-x", passed: true, reasoning: "" },
          { tag: "should-y", passed: true, reasoning: "" },
        ],
      }),
    ];
    const tags = aggregatePerTag(r);
    expect(tags).toEqual([
      { tag: "should-x", total: 2, passed: 2, pass_rate: 1 },
      { tag: "should-y", total: 2, passed: 1, pass_rate: 0.5 },
    ]);
  });
});

describe("diffReports", () => {
  it("highlights newly-failing cases when current is worse than baseline", () => {
    const baseline = mkReport({
      cases: [
        mkCaseResult({ id: "a", category: "hint", passed: true }),
        mkCaseResult({ id: "b", category: "hint", passed: true }),
      ],
    });
    const current = mkReport({
      cases: [
        mkCaseResult({ id: "a", category: "hint", passed: true }),
        mkCaseResult({ id: "b", category: "hint", passed: false }),
      ],
    });
    const d = diffReports(baseline, current);
    expect(d.newly_failing_case_ids).toEqual(["b"]);
    expect(d.newly_passing_case_ids).toEqual([]);
    expect(d.overall_delta).toBeLessThan(0);
  });

  it("highlights newly-passing cases when current is better than baseline", () => {
    const baseline = mkReport({
      cases: [
        mkCaseResult({ id: "a", category: "hint", passed: false }),
        mkCaseResult({ id: "b", category: "hint", passed: false }),
      ],
    });
    const current = mkReport({
      cases: [
        mkCaseResult({ id: "a", category: "hint", passed: true }),
        mkCaseResult({ id: "b", category: "hint", passed: false }),
      ],
    });
    const d = diffReports(baseline, current);
    expect(d.newly_passing_case_ids).toEqual(["a"]);
    expect(d.newly_failing_case_ids).toEqual([]);
    expect(d.overall_delta).toBeGreaterThan(0);
  });
});

describe("renderReportMarkdown", () => {
  it("renders an overall summary line and per-category table", () => {
    const r = mkReport({
      cases: [
        mkCaseResult({ id: "a", category: "hint", passed: true }),
        mkCaseResult({ id: "b", category: "hint", passed: false }),
      ],
    });
    const md = renderReportMarkdown(r);
    expect(md).toMatch(/Overall:.*1\/2/);
    expect(md).toMatch(/Per category/);
  });

  it("includes a 'Newly FAILING' section when diff highlights regressions", () => {
    const baseline = mkReport({
      cases: [mkCaseResult({ id: "a", category: "hint", passed: true })],
    });
    const current = mkReport({
      cases: [mkCaseResult({ id: "a", category: "hint", passed: false })],
    });
    const md = renderReportMarkdown(current, diffReports(baseline, current));
    expect(md).toMatch(/Newly FAILING/);
    expect(md).toMatch(/`a`/);
  });
});

// -------- helpers ---------

function mkCaseResult(args: {
  id: string;
  category: "hint" | "grade" | "onboarding" | "session-plan";
  passed: boolean;
  tags?: Array<{ tag: string; passed: boolean; reasoning: string }>;
}): CaseResult {
  return {
    id: args.id,
    category: args.category,
    system_prompt_under_test: "v",
    passed: args.passed,
    explicit_failure_hits: [],
    json_shape_ok: true,
    tag_judgments: args.tags ?? [],
    response_text: "",
    model: "fake",
    latency_ms: 1,
    cost_usd: 0,
  };
}

function mkReport(args: { cases: CaseResult[] }): EvalReport {
  const passed = args.cases.filter((c) => c.passed).length;
  return {
    version: EVAL_REPORT_VERSION,
    generated_at: "2026-05-01T00:00:00Z",
    total_cases: args.cases.length,
    passed_cases: passed,
    overall_pass_rate: args.cases.length === 0 ? 0 : passed / args.cases.length,
    judge_model: "fake",
    total_cost_usd: 0,
    cases: args.cases,
    per_category: aggregatePerCategory(args.cases),
    per_tag: aggregatePerTag(args.cases),
  };
}
