// STORY-034a — unit tests for the live-LLM A/B harness. Everything here is deterministic:
// the fake LLM emits canned JSON for each call so the runner / parsers / metrics path can be
// exercised end-to-end without an Anthropic key. The real live-LLM run is gated by
// LEARNPRO_RUN_LIVE_LLM_EVAL=1 and lives in `grader-ab-cli.ts`.

import { describe, expect, it } from "vitest";
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
  GraderAbCaseFileSchema,
  binUnifiedIdiomatic,
  computeGraderAbMetrics,
  forbiddenPhrasesForGraderAb,
  liveLlmEvalEnabled,
  loadGraderAbCases,
  parseSplitResponse,
  parseUnifiedResponse,
  renderGraderAbMarkdown,
  runGraderAb,
  scanForbiddenPhrases,
  type GraderAbReport,
  type GraderAbSampleResult,
} from "./grader-ab.js";

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

describe("loadGraderAbCases", () => {
  it("loads the canonical case file and validates its shape", async () => {
    const cases = await loadGraderAbCases();
    expect(cases.id).toBe("grade-split-vs-unified-live");
    expect(cases.story).toBe("STORY-034a");
    expect(cases.transcripts.length).toBeGreaterThanOrEqual(5);
    expect(cases.transcripts.length).toBeLessThanOrEqual(20);
    for (const t of cases.transcripts) {
      expect(t.label).toMatch(/^[a-z0-9-]+$/);
      expect(t.passed_tests).toBeLessThanOrEqual(t.total_tests);
    }
  });

  it("includes both Python and TypeScript transcripts", async () => {
    const cases = await loadGraderAbCases();
    const languages = new Set(cases.transcripts.map((t) => t.problem_language));
    expect(languages.has("python")).toBe(true);
    expect(languages.has("typescript")).toBe(true);
  });

  it("includes a mix of passing and failing submissions", async () => {
    const cases = await loadGraderAbCases();
    const fullyPassing = cases.transcripts.filter((t) => t.passed_tests === t.total_tests);
    const failing = cases.transcripts.filter((t) => t.passed_tests < t.total_tests);
    expect(fullyPassing.length).toBeGreaterThan(0);
    expect(failing.length).toBeGreaterThan(0);
  });

  it("rejects a malformed case file via Zod", () => {
    expect(() =>
      GraderAbCaseFileSchema.parse({
        id: "wrong-id",
        story: "STORY-034a",
        description: "x",
        transcripts: [],
      }),
    ).toThrow();
  });

  it("rejects transcripts with non-kebab-case labels", () => {
    const candidate = {
      id: "grade-split-vs-unified-live",
      story: "STORY-034a",
      description: "x",
      transcripts: Array.from({ length: 5 }, (_, i) => ({
        label: i === 0 ? "Has Spaces" : `t-${i}`,
        problem_name: "x",
        problem_language: "python" as const,
        problem_statement: "x",
        user_code: "pass",
        total_tests: 1,
        passed_tests: 1,
        failing_test_summaries: [],
      })),
    };
    expect(() => GraderAbCaseFileSchema.parse(candidate)).toThrow();
  });
});

describe("forbidden-phrase scanner", () => {
  it("flags coach-voice violations in tutor commentary", () => {
    expect(scanForbiddenPhrases("DON'T LOSE your streak")).toContain("loss-aversion");
    expect(scanForbiddenPhrases("DAY 3 of your run")).toContain("day-shouting");
    expect(scanForbiddenPhrases("hurry up before it expires")).toContain("hurry-fomo");
    expect(scanForbiddenPhrases("You MUST do this now")).toContain("must-imperative");
    expect(scanForbiddenPhrases("rank on the leaderboard")).toContain("leaderboard");
    expect(scanForbiddenPhrases("burn 🔥 emoji")).toContain("fire-emoji");
    expect(scanForbiddenPhrases("warning ⚠️ emoji")).toContain("warning-emoji");
  });

  it("flags praise tokens the grader is meant to avoid", () => {
    expect(scanForbiddenPhrases("Great work on the solve!")).toContain("praise-great-work");
    expect(scanForbiddenPhrases("Excellent reasoning here.")).toContain("praise-excellent");
    expect(scanForbiddenPhrases("Amazing approach.")).toContain("praise-amazing");
  });

  it("returns empty for clean grader prose", () => {
    expect(
      scanForbiddenPhrases(
        "The submission uses a hash map for O(n) lookup; empty input handled implicitly.",
      ),
    ).toEqual([]);
  });

  it("forbiddenPhrasesForGraderAb returns the rule list with labels and regex", () => {
    const rules = forbiddenPhrasesForGraderAb();
    expect(rules.length).toBeGreaterThan(0);
    for (const r of rules) {
      expect(typeof r.label).toBe("string");
      expect(r.pattern).toBeInstanceOf(RegExp);
    }
  });

  it("scans the case file's notes + descriptions for forbidden phrases", async () => {
    const cases = await loadGraderAbCases();
    const blobs = [cases.description, ...cases.transcripts.map((t) => t.notes ?? "")];
    for (const text of blobs) {
      expect(scanForbiddenPhrases(text)).toEqual([]);
    }
  });
});

describe("parseUnifiedResponse", () => {
  it("parses a clean rubric + prose", () => {
    const parsed = parseUnifiedResponse(
      JSON.stringify({
        rubric: { correctness: 1, idiomatic: 0.85, edge_case_coverage: 0.8 },
        prose_explanation: "Hash-map approach is idiomatic; empty-list path is implicit.",
      }),
    );
    expect(parsed?.rubric.idiomatic).toBe(0.85);
    expect(parsed?.prose_explanation).toMatch(/hash-map/i);
  });

  it("strips ```json fences", () => {
    const wrapped =
      "```json\n" +
      JSON.stringify({
        rubric: { correctness: 1, idiomatic: 0.5, edge_case_coverage: 0.5 },
        prose_explanation: "ok",
      }) +
      "\n```";
    expect(parseUnifiedResponse(wrapped)).not.toBeNull();
  });

  it("returns null on missing prose_explanation", () => {
    const text = JSON.stringify({
      rubric: { correctness: 1, idiomatic: 0.5, edge_case_coverage: 0.5 },
    });
    expect(parseUnifiedResponse(text)).toBeNull();
  });

  it("returns null on out-of-range rubric values", () => {
    const text = JSON.stringify({
      rubric: { correctness: 1.5, idiomatic: 0.5, edge_case_coverage: 0.5 },
      prose_explanation: "ok",
    });
    expect(parseUnifiedResponse(text)).toBeNull();
  });

  it("returns null when text is not JSON", () => {
    expect(parseUnifiedResponse("not json")).toBeNull();
  });
});

describe("parseSplitResponse", () => {
  it("parses a clean split rubric", () => {
    const parsed = parseSplitResponse(
      JSON.stringify({
        pass: true,
        rubric: { idiomatic: 5, efficiency: 5, test_coverage_thinking: 4 },
        reasoning: "Single-pass dict lookup is idiomatic.",
      }),
    );
    expect(parsed?.rubric.idiomatic).toBe(5);
    expect(parsed?.pass).toBe(true);
  });

  it("coerces stringified integers to numeric scores", () => {
    const parsed = parseSplitResponse(
      JSON.stringify({
        pass: false,
        rubric: { idiomatic: "2", efficiency: "1", test_coverage_thinking: "3" },
        reasoning: "Nested loop.",
      }),
    );
    expect(parsed?.rubric).toEqual({ idiomatic: 2, efficiency: 1, test_coverage_thinking: 3 });
  });

  it("clamps out-of-range integers to [1,5]", () => {
    const parsed = parseSplitResponse(
      JSON.stringify({
        pass: true,
        rubric: { idiomatic: 7, efficiency: -1, test_coverage_thinking: 5 },
        reasoning: "x",
      }),
    );
    expect(parsed?.rubric).toEqual({ idiomatic: 5, efficiency: 1, test_coverage_thinking: 5 });
  });

  it("returns null on missing pass boolean", () => {
    expect(
      parseSplitResponse(
        JSON.stringify({
          rubric: { idiomatic: 3, efficiency: 3, test_coverage_thinking: 3 },
          reasoning: "x",
        }),
      ),
    ).toBeNull();
  });

  it("returns null on missing reasoning", () => {
    expect(
      parseSplitResponse(
        JSON.stringify({
          pass: true,
          rubric: { idiomatic: 3, efficiency: 3, test_coverage_thinking: 3 },
        }),
      ),
    ).toBeNull();
  });
});

describe("binUnifiedIdiomatic", () => {
  it("maps continuous [0,1] into 5 equal-width buckets", () => {
    expect(binUnifiedIdiomatic(0.0)).toBe(1);
    expect(binUnifiedIdiomatic(0.19)).toBe(1);
    expect(binUnifiedIdiomatic(0.2)).toBe(2);
    expect(binUnifiedIdiomatic(0.39)).toBe(2);
    expect(binUnifiedIdiomatic(0.4)).toBe(3);
    expect(binUnifiedIdiomatic(0.59)).toBe(3);
    expect(binUnifiedIdiomatic(0.6)).toBe(4);
    expect(binUnifiedIdiomatic(0.79)).toBe(4);
    expect(binUnifiedIdiomatic(0.8)).toBe(5);
    expect(binUnifiedIdiomatic(1.0)).toBe(5);
  });
});

describe("computeGraderAbMetrics", () => {
  it("computes range-normalized variance, distinct buckets, and forbidden rate", () => {
    const samples: GraderAbSampleResult[] = [
      mkSample({
        unifiedIdiomatic: 0.9,
        splitIdiomatic: 5,
        splitEfficiency: 5,
        splitTestCov: 4,
      }),
      mkSample({
        unifiedIdiomatic: 0.7,
        splitIdiomatic: 2,
        splitEfficiency: 1,
        splitTestCov: 3,
        unifiedForbidden: ["praise-great-work"],
      }),
      mkSample({
        unifiedIdiomatic: 0.6,
        splitIdiomatic: 3,
        splitEfficiency: 3,
        splitTestCov: 3,
      }),
      mkSample({
        unifiedIdiomatic: 0.95,
        splitIdiomatic: 5,
        splitEfficiency: 4,
        splitTestCov: 4,
      }),
    ];
    const m = computeGraderAbMetrics(samples);
    expect(m.total_samples).toBe(4);
    expect(m.unified_parsed_count).toBe(4);
    expect(m.split_parsed_count).toBe(4);
    expect(m.unified_idiomatic_variance_normalized).toBeGreaterThan(0);
    expect(m.split_idiomatic_variance_normalized).toBeGreaterThan(0);
    expect(m.unified_forbidden_phrase_rate).toBeCloseTo(0.25, 5);
    expect(m.split_forbidden_phrase_rate).toBe(0);
    expect(m.unified_idiomatic_distinct_buckets).toBeGreaterThanOrEqual(2);
    expect(m.split_idiomatic_distinct_buckets).toBeGreaterThanOrEqual(2);
  });

  it("handles empty sample sets without dividing by zero", () => {
    const m = computeGraderAbMetrics([]);
    expect(m.total_samples).toBe(0);
    expect(m.unified_forbidden_phrase_rate).toBe(0);
    expect(m.split_forbidden_phrase_rate).toBe(0);
    expect(m.unified_idiomatic_distinct_buckets).toBe(0);
    expect(m.split_idiomatic_distinct_buckets).toBe(0);
  });
});

describe("runGraderAb", () => {
  it("runs both prompts per transcript, parses both, and computes metrics", async () => {
    const cases = await loadGraderAbCases();
    // Trim to 3 transcripts to keep the test fast.
    const trimmed = { ...cases, transcripts: cases.transcripts.slice(0, 3) };

    let callIdx = 0;
    const llm = makeFakeLLM((req) => {
      callIdx += 1;
      const isSplit = (req.system ?? "").startsWith("You are LearnPro's grader. You are not");
      if (isSplit) {
        return JSON.stringify({
          pass: true,
          rubric: {
            idiomatic: 3 + (callIdx % 3),
            efficiency: 4,
            test_coverage_thinking: 3,
          },
          reasoning: "Direct factual sentence about the submission.",
        });
      }
      return JSON.stringify({
        rubric: {
          correctness: 1,
          idiomatic: 0.5 + (callIdx % 3) * 0.1,
          edge_case_coverage: 0.7,
        },
        prose_explanation: "Brief candid explanation.",
      });
    });

    const report = await runGraderAb({
      llm,
      cases: trimmed,
      onProgress: SILENT,
      now: () => 1700000000000,
    });

    expect(report.version).toBe("grader-ab-2026-05-11");
    expect(report.samples.length).toBe(3);
    expect(report.metrics.total_samples).toBe(3);
    expect(report.metrics.unified_parsed_count).toBe(3);
    expect(report.metrics.split_parsed_count).toBe(3);
    expect(report.total_cost_usd).toBeGreaterThan(0);
    expect(report.unified_prompt_version.length).toBeGreaterThan(0);
    expect(report.split_prompt_version.length).toBeGreaterThan(0);
  });

  it("records a non-parsed sample when the LLM returns garbage", async () => {
    const cases = await loadGraderAbCases();
    const trimmed = { ...cases, transcripts: cases.transcripts.slice(0, 1) };

    const llm = makeFakeLLM(() => "not json at all");

    const report = await runGraderAb({
      llm,
      cases: trimmed,
      onProgress: SILENT,
      now: () => 1700000000000,
    });
    expect(report.samples[0]?.unified.parsed).toBe(false);
    expect(report.samples[0]?.split.parsed).toBe(false);
    expect(report.metrics.unified_parsed_count).toBe(0);
    expect(report.metrics.split_parsed_count).toBe(0);
  });

  it("flags forbidden phrases in returned grader prose", async () => {
    const cases = await loadGraderAbCases();
    const trimmed = { ...cases, transcripts: cases.transcripts.slice(0, 1) };

    const llm = makeFakeLLM((req) => {
      const isSplit = (req.system ?? "").startsWith("You are LearnPro's grader. You are not");
      if (isSplit) {
        return JSON.stringify({
          pass: true,
          rubric: { idiomatic: 5, efficiency: 5, test_coverage_thinking: 5 },
          reasoning: "Excellent work — this is amazing!",
        });
      }
      return JSON.stringify({
        rubric: { correctness: 1, idiomatic: 0.9, edge_case_coverage: 0.85 },
        prose_explanation: "Great work — DAY 1 of streak.",
      });
    });

    const report = await runGraderAb({
      llm,
      cases: trimmed,
      onProgress: SILENT,
      now: () => 1700000000000,
    });
    expect(report.samples[0]?.unified.forbidden_phrase_labels.length).toBeGreaterThan(0);
    expect(report.samples[0]?.split.forbidden_phrase_labels.length).toBeGreaterThan(0);
    expect(report.metrics.unified_forbidden_phrase_rate).toBe(1);
    expect(report.metrics.split_forbidden_phrase_rate).toBe(1);
  });
});

describe("liveLlmEvalEnabled", () => {
  it("returns true only when LEARNPRO_RUN_LIVE_LLM_EVAL is exactly '1'", () => {
    expect(liveLlmEvalEnabled({ LEARNPRO_RUN_LIVE_LLM_EVAL: "1" })).toBe(true);
    expect(liveLlmEvalEnabled({ LEARNPRO_RUN_LIVE_LLM_EVAL: "true" })).toBe(false);
    expect(liveLlmEvalEnabled({ LEARNPRO_RUN_LIVE_LLM_EVAL: "" })).toBe(false);
    expect(liveLlmEvalEnabled({})).toBe(false);
  });
});

describe("renderGraderAbMarkdown", () => {
  it("renders a header, metrics table, and per-sample table", () => {
    const report: GraderAbReport = {
      version: "grader-ab-2026-05-11",
      generated_at: "2026-05-11T00:00:00Z",
      prompt_under_test_model: "claude-haiku-4",
      unified_prompt_version: "tutor-2026-05-03",
      split_prompt_version: "grader-2026-05-06",
      total_cost_usd: 1.23,
      samples: [
        mkSample({
          label: "alpha",
          unifiedIdiomatic: 0.9,
          splitIdiomatic: 5,
          splitEfficiency: 5,
          splitTestCov: 4,
        }),
      ],
      metrics: {
        unified_idiomatic_variance_normalized: 0.02,
        split_idiomatic_variance_normalized: 0.08,
        unified_idiomatic_distinct_buckets: 3,
        split_idiomatic_distinct_buckets: 4,
        unified_forbidden_phrase_rate: 0,
        split_forbidden_phrase_rate: 0,
        unified_parsed_count: 1,
        split_parsed_count: 1,
        total_samples: 1,
      },
    };
    const md = renderGraderAbMarkdown(report);
    expect(md).toMatch(/Grader split A\/B/);
    expect(md).toMatch(/Headline metrics/);
    expect(md).toMatch(/alpha/);
    expect(md).toMatch(/tutor-2026-05-03/);
    expect(md).toMatch(/grader-2026-05-06/);
  });
});

// -------- helpers ---------

function mkSample(args: {
  label?: string;
  unifiedIdiomatic: number;
  splitIdiomatic: 1 | 2 | 3 | 4 | 5;
  splitEfficiency: 1 | 2 | 3 | 4 | 5;
  splitTestCov: 1 | 2 | 3 | 4 | 5;
  unifiedForbidden?: ReadonlyArray<string>;
  splitForbidden?: ReadonlyArray<string>;
}): GraderAbSampleResult {
  return {
    label: args.label ?? "t",
    unified: {
      parsed: true,
      rubric: {
        correctness: 1,
        idiomatic: args.unifiedIdiomatic,
        edge_case_coverage: 0.8,
      },
      prose_explanation: "ok",
      raw_text: "ok",
      cost_usd: 0,
      forbidden_phrase_labels: args.unifiedForbidden ?? [],
    },
    split: {
      parsed: true,
      pass: true,
      rubric: {
        idiomatic: args.splitIdiomatic,
        efficiency: args.splitEfficiency,
        test_coverage_thinking: args.splitTestCov,
      },
      reasoning: "ok",
      raw_text: "ok",
      cost_usd: 0,
      forbidden_phrase_labels: args.splitForbidden ?? [],
    },
  };
}
