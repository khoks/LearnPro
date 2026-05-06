// STORY-035 — eval runner.
//
// Two-layer scoring:
//   1. Deterministic checks: explicit_failure_patterns regex sweep + JSON-shape validation
//      against the prompt's expected output schema (when applicable).
//   2. LLM-as-judge (Haiku, cheap+fast): grades each `expected_behavior_tag` independently
//      with a strict rubric system prompt; returns { tag, passed, reasoning }.
//
// A case passes overall iff:
//   - no explicit_failure_pattern matched, AND
//   - the JSON shape check passed (when the category requires structured output), AND
//   - every tag the judge graded was passed=true.
//
// Cost: ~50 cases × (1 prompt-under-test call + N judge calls per case). Haiku at $1/$5/Mtok
// keeps a full run inside the $0.50–$2 envelope per spec.

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ANTHROPIC_HAIKU, costFor, type ChatMessage, type LLMProvider } from "@learnpro/llm";
import {
  buildGradeSystemPrompt,
  buildHintSystemPrompt,
  ONBOARDING_SYSTEM_PROMPT,
  SESSION_PLAN_SYSTEM_PROMPT,
} from "@learnpro/prompts";
import {
  EVAL_REPORT_VERSION,
  type CaseResult,
  type CategoryAggregate,
  type EvalCase,
  type EvalCategory,
  type EvalReport,
  type ExplicitFailureHit,
  type ExplicitFailurePattern,
  type TagAggregate,
  type TagJudgment,
} from "./types.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = join(HERE, "reports");

export interface RunEvalsOptions {
  llm: LLMProvider;
  judge?: LLMProvider; // defaults to llm if not provided
  cases: ReadonlyArray<EvalCase>;
  filter?: EvalCategory;
  judge_model?: string;
  prompt_under_test_model?: string;
  // Streams progress lines to this hook (defaults to console.log). Pass () => {} in tests.
  onProgress?: (line: string) => void;
  // For deterministic clocks in tests. Defaults to () => Date.now().
  now?: () => number;
}

export async function runEvals(opts: RunEvalsOptions): Promise<EvalReport> {
  const onProgress = opts.onProgress ?? ((line: string) => console.log(line));
  const now = opts.now ?? (() => Date.now());
  const judge = opts.judge ?? opts.llm;
  const judgeModel = opts.judge_model ?? ANTHROPIC_HAIKU;
  const promptUnderTestModel = opts.prompt_under_test_model ?? ANTHROPIC_HAIKU;

  const filtered = opts.filter ? opts.cases.filter((c) => c.category === opts.filter) : opts.cases;
  if (filtered.length === 0) {
    onProgress(`[evals] no cases match filter=${opts.filter ?? "<none>"}, exiting.`);
  }
  onProgress(`[evals] running ${filtered.length} case(s) with judge=${judgeModel}…`);

  const results: CaseResult[] = [];
  let totalCost = 0;

  for (let i = 0; i < filtered.length; i++) {
    const c = filtered[i]!;
    const start = now();
    onProgress(`[evals] (${i + 1}/${filtered.length}) ${c.id} [${c.category}]`);
    try {
      const result = await runOneCase({
        c,
        llm: opts.llm,
        judge,
        judgeModel,
        promptUnderTestModel,
        now,
      });
      totalCost += result.cost_usd;
      const status = result.passed ? "PASS" : "FAIL";
      onProgress(
        `[evals]   → ${status} (${result.latency_ms}ms, $${result.cost_usd.toFixed(4)})${
          result.error ? " — error: " + result.error : ""
        }`,
      );
      results.push(result);
    } catch (e) {
      const elapsed = now() - start;
      const msg = (e as Error).message ?? String(e);
      onProgress(`[evals]   → ERROR ${msg}`);
      results.push({
        id: c.id,
        category: c.category,
        system_prompt_under_test: c.system_prompt_under_test,
        passed: false,
        explicit_failure_hits: [],
        json_shape_ok: false,
        tag_judgments: [],
        response_text: "",
        model: promptUnderTestModel,
        latency_ms: elapsed,
        cost_usd: 0,
        error: msg,
      });
    }
  }

  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  const overall = total === 0 ? 0 : passed / total;
  const perCategory = aggregatePerCategory(results);
  const perTag = aggregatePerTag(results);

  const report: EvalReport = {
    version: EVAL_REPORT_VERSION,
    generated_at: new Date(now()).toISOString(),
    total_cases: total,
    passed_cases: passed,
    overall_pass_rate: overall,
    filter: opts.filter,
    judge_model: judgeModel,
    total_cost_usd: round6(totalCost),
    cases: results,
    per_category: perCategory,
    per_tag: perTag,
  };
  onProgress(
    `[evals] done. ${passed}/${total} passed (${(overall * 100).toFixed(1)}%). ` +
      `cost=$${totalCost.toFixed(4)}.`,
  );
  return report;
}

interface RunOneOpts {
  c: EvalCase;
  llm: LLMProvider;
  judge: LLMProvider;
  judgeModel: string;
  promptUnderTestModel: string;
  now: () => number;
}

async function runOneCase(opts: RunOneOpts): Promise<CaseResult> {
  const { c, llm, judge, judgeModel, promptUnderTestModel, now } = opts;
  const systemPrompt = systemPromptFor(c);
  const messages: ChatMessage[] = c.input.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const t0 = now();
  const response = await llm.complete({
    messages,
    system: systemPrompt,
    model: promptUnderTestModel,
    max_tokens: 1024,
    temperature: 0.7,
    prompt_version: c.system_prompt_under_test,
  });
  const t1 = now();
  const responseCost = costFor({
    model: response.model,
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
  }).cost_usd;
  const latency = t1 - t0;
  const text = response.text;

  const explicitHits = scanExplicitFailures(text, c.explicit_failure_patterns);
  const jsonShapeOk = checkJsonShape(c.category, text);

  let tagJudgments: TagJudgment[] = [];
  let judgeCost = 0;
  // Skip judge if deterministic checks already failed — saves cost on bad outputs.
  if (explicitHits.length === 0 && jsonShapeOk) {
    const j = await judgeAllTags({
      c,
      response_text: text,
      judge,
      judgeModel,
    });
    tagJudgments = j.judgments;
    judgeCost = j.cost_usd;
  }

  const passed = explicitHits.length === 0 && jsonShapeOk && tagJudgments.every((j) => j.passed);

  return {
    id: c.id,
    category: c.category,
    system_prompt_under_test: c.system_prompt_under_test,
    passed,
    explicit_failure_hits: explicitHits,
    json_shape_ok: jsonShapeOk,
    tag_judgments: tagJudgments,
    response_text: truncate(text, 4000),
    model: response.model,
    latency_ms: latency,
    cost_usd: round6(responseCost + judgeCost),
  };
}

// ----------------------------------------------------------------------------
// Layer 1: deterministic checks
// ----------------------------------------------------------------------------

export function scanExplicitFailures(
  response: string,
  patterns: ReadonlyArray<ExplicitFailurePattern>,
): ExplicitFailureHit[] {
  const hits: ExplicitFailureHit[] = [];
  for (const p of patterns) {
    let re: RegExp;
    try {
      const compiled = compilePattern(p);
      re = compiled;
    } catch {
      hits.push({
        pattern: p.pattern,
        message: `Invalid regex literal in eval case: ${p.pattern}`,
      });
      continue;
    }
    if (re.test(response)) {
      hits.push({ pattern: p.pattern, message: p.message });
    }
  }
  return hits;
}

// JS RegExp doesn't accept inline-flag prefixes like (?i). We let authors write Python/PCRE-style
// (?i) at the start of a pattern (it's the form they're used to from grep / pytest assertions)
// and translate it to the explicit JS `flags` argument.
function compilePattern(p: ExplicitFailurePattern): RegExp {
  let pattern = p.pattern;
  let flags = p.flags ?? "";
  const inline = /^\(\?([imsux]+)\)/.exec(pattern);
  if (inline) {
    pattern = pattern.slice(inline[0].length);
    for (const f of inline[1] ?? "") {
      // JS supports i, m, s, u — silently drop x (extended) since JS lacks it.
      if ("imsu".includes(f) && !flags.includes(f)) flags += f;
    }
  }
  return new RegExp(pattern, flags);
}

// JSON-shape gate. Hint responses are free-form text — always pass shape. Grade / onboarding /
// session-plan prompts contract structured JSON; if those fail to parse, the case fails fast
// without burning a judge call.
export function checkJsonShape(category: EvalCategory, response: string): boolean {
  if (category === "hint") return true;
  const obj = tryParseJsonObject(response);
  if (!obj) return false;
  switch (category) {
    case "grade":
      return hasGradeShape(obj);
    case "onboarding":
      return hasOnboardingShape(obj);
    case "session-plan":
      return hasSessionPlanShape(obj);
    default:
      return true;
  }
}

function tryParseJsonObject(text: string): Record<string, unknown> | null {
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    const parsed = JSON.parse(stripped) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function hasGradeShape(obj: Record<string, unknown>): boolean {
  const rubric = obj["rubric"];
  if (!rubric || typeof rubric !== "object") return false;
  const r = rubric as Record<string, unknown>;
  for (const key of ["correctness", "idiomatic", "edge_case_coverage"]) {
    const v = r[key];
    if (typeof v !== "number" || v < 0 || v > 1) return false;
  }
  return typeof obj["prose_explanation"] === "string";
}

function hasOnboardingShape(obj: Record<string, unknown>): boolean {
  if (typeof obj["assistant_message"] !== "string") return false;
  if (typeof obj["done"] !== "boolean") return false;
  if (obj["captured"] !== undefined && obj["captured"] !== null) {
    if (typeof obj["captured"] !== "object") return false;
  }
  return true;
}

function hasSessionPlanShape(obj: Record<string, unknown>): boolean {
  const items = obj["items"];
  if (!Array.isArray(items)) return false;
  if (items.length < 3 || items.length > 5) return false;
  for (const it of items) {
    if (!it || typeof it !== "object") return false;
    const r = it as Record<string, unknown>;
    if (typeof r["slug"] !== "string") return false;
    if (typeof r["objective"] !== "string") return false;
    if (typeof r["estimated_duration_min"] !== "number") return false;
  }
  return true;
}

// ----------------------------------------------------------------------------
// Layer 2: LLM-as-judge
// ----------------------------------------------------------------------------

const JUDGE_SYSTEM_PROMPT = `You are an evaluation judge for an AI coding tutor.

You will see:
- The CATEGORY of the prompt being evaluated (hint / grade / onboarding / session-plan).
- The full RESPONSE produced by the prompt under test.
- A single behavior TAG to evaluate. Tags are kebab-case, e.g. "should-not-reveal-final-answer".

# Your job
Decide whether the response satisfies the tag. The tag's name is your rubric: "should-X" means the response must X; "should-not-X" means the response must not X. Be strict but fair — partial compliance is a fail.

# Rules
- Output ONLY a JSON object (no prose before or after, no markdown fences) of the form:
  { "passed": boolean, "reasoning": string }
- "reasoning" is one or two short sentences explaining your call. Cite specific quotes from the response when possible.
- A tag like "should-not-include-code-block" passes ONLY if the response contains no fenced or indented code block.
- A tag like "should-be-2-to-4-sentences" passes only if the relevant text portion has 2–4 sentences (count terminating punctuation).
- A tag like "should-set-correctness-1.0-when-all-tests-pass" passes only when rubric.correctness === 1.0 (or 1).
- A tag about "warm-coach voice" / "no praise" passes if the response avoids effusive praise like "great job", "excellent work", "amazing".
- If you genuinely cannot tell, default to "passed": false and explain why.`;

interface JudgeResult {
  judgments: TagJudgment[];
  cost_usd: number;
}

async function judgeAllTags(args: {
  c: EvalCase;
  response_text: string;
  judge: LLMProvider;
  judgeModel: string;
}): Promise<JudgeResult> {
  const { c, response_text, judge, judgeModel } = args;
  const judgments: TagJudgment[] = [];
  let cost = 0;
  for (const tag of c.expected_behavior_tags) {
    const userMsg = [
      `CATEGORY: ${c.category}`,
      `TAG TO EVALUATE: ${tag}`,
      "",
      "RESPONSE:",
      "<<<",
      response_text,
      ">>>",
      "",
      'Output the JSON object now: { "passed": boolean, "reasoning": string }',
    ].join("\n");
    const out = await judge.complete({
      messages: [{ role: "user", content: userMsg }],
      system: JUDGE_SYSTEM_PROMPT,
      model: judgeModel,
      max_tokens: 256,
      temperature: 0,
    });
    cost += costFor({
      model: out.model,
      input_tokens: out.usage.input_tokens,
      output_tokens: out.usage.output_tokens,
    }).cost_usd;
    judgments.push(parseJudgeResponse(tag, out.text));
  }
  return { judgments, cost_usd: round6(cost) };
}

export function parseJudgeResponse(tag: string, text: string): TagJudgment {
  const obj = tryParseJsonObject(text);
  if (!obj) {
    return {
      tag,
      passed: false,
      reasoning: `Judge returned non-JSON output: ${truncate(text, 200)}`,
    };
  }
  if (typeof obj["passed"] !== "boolean") {
    return {
      tag,
      passed: false,
      reasoning: `Judge JSON missing "passed" boolean: ${truncate(text, 200)}`,
    };
  }
  const reasoning =
    typeof obj["reasoning"] === "string" ? obj["reasoning"] : "(no reasoning provided)";
  return { tag, passed: obj["passed"], reasoning };
}

// ----------------------------------------------------------------------------
// Aggregation
// ----------------------------------------------------------------------------

export function aggregatePerCategory(results: ReadonlyArray<CaseResult>): CategoryAggregate[] {
  const cats: EvalCategory[] = ["hint", "grade", "onboarding", "session-plan"];
  return cats
    .map((c) => {
      const rows = results.filter((r) => r.category === c);
      const passed = rows.filter((r) => r.passed).length;
      return {
        category: c,
        total: rows.length,
        passed,
        pass_rate: rows.length === 0 ? 0 : passed / rows.length,
      };
    })
    .filter((row) => row.total > 0);
}

export function aggregatePerTag(results: ReadonlyArray<CaseResult>): TagAggregate[] {
  const totals = new Map<string, { total: number; passed: number }>();
  for (const r of results) {
    for (const j of r.tag_judgments) {
      const cur = totals.get(j.tag) ?? { total: 0, passed: 0 };
      cur.total += 1;
      if (j.passed) cur.passed += 1;
      totals.set(j.tag, cur);
    }
  }
  return Array.from(totals.entries())
    .map(([tag, v]) => ({
      tag,
      total: v.total,
      passed: v.passed,
      pass_rate: v.total === 0 ? 0 : v.passed / v.total,
    }))
    .sort((a, b) => a.tag.localeCompare(b.tag));
}

// ----------------------------------------------------------------------------
// Diff (used by the CLI's --baseline flag)
// ----------------------------------------------------------------------------

export interface ReportDiff {
  overall_delta: number;
  per_category_deltas: Array<{
    category: EvalCategory;
    baseline: number;
    current: number;
    delta: number;
  }>;
  per_tag_deltas: Array<{ tag: string; baseline: number; current: number; delta: number }>;
  newly_failing_case_ids: string[];
  newly_passing_case_ids: string[];
}

export function diffReports(baseline: EvalReport, current: EvalReport): ReportDiff {
  const baseByCategory = new Map(baseline.per_category.map((r) => [r.category, r.pass_rate]));
  const currByCategory = new Map(current.per_category.map((r) => [r.category, r.pass_rate]));
  const cats = new Set<EvalCategory>([...baseByCategory.keys(), ...currByCategory.keys()]);
  const per_category_deltas = Array.from(cats)
    .sort()
    .map((category) => {
      const b = baseByCategory.get(category) ?? 0;
      const c = currByCategory.get(category) ?? 0;
      return { category, baseline: b, current: c, delta: round6(c - b) };
    });

  const baseByTag = new Map(baseline.per_tag.map((r) => [r.tag, r.pass_rate]));
  const currByTag = new Map(current.per_tag.map((r) => [r.tag, r.pass_rate]));
  const tags = new Set<string>([...baseByTag.keys(), ...currByTag.keys()]);
  const per_tag_deltas = Array.from(tags)
    .sort()
    .map((tag) => {
      const b = baseByTag.get(tag) ?? 0;
      const c = currByTag.get(tag) ?? 0;
      return { tag, baseline: b, current: c, delta: round6(c - b) };
    })
    .filter((row) => row.delta !== 0);

  const baseStatus = new Map(baseline.cases.map((r) => [r.id, r.passed]));
  const currStatus = new Map(current.cases.map((r) => [r.id, r.passed]));
  const newly_failing: string[] = [];
  const newly_passing: string[] = [];
  for (const [id, currPassed] of currStatus.entries()) {
    const basePassed = baseStatus.get(id);
    if (basePassed === undefined) continue;
    if (basePassed && !currPassed) newly_failing.push(id);
    if (!basePassed && currPassed) newly_passing.push(id);
  }
  return {
    overall_delta: round6(current.overall_pass_rate - baseline.overall_pass_rate),
    per_category_deltas,
    per_tag_deltas,
    newly_failing_case_ids: newly_failing.sort(),
    newly_passing_case_ids: newly_passing.sort(),
  };
}

// ----------------------------------------------------------------------------
// Report I/O + markdown rendering
// ----------------------------------------------------------------------------

export async function writeReportToFile(report: EvalReport): Promise<string> {
  await mkdir(REPORTS_DIR, { recursive: true });
  const stamp = report.generated_at.replace(/[:]/g, "-").replace(/\.\d+Z$/, "Z");
  const path = join(REPORTS_DIR, `${stamp}.json`);
  await writeFile(path, JSON.stringify(report, null, 2), "utf8");
  return path;
}

export function renderReportMarkdown(report: EvalReport, diff?: ReportDiff): string {
  const lines: string[] = [];
  lines.push(`# Prompt eval report — ${report.generated_at}`);
  lines.push("");
  lines.push(
    `**Overall:** ${report.passed_cases}/${report.total_cases} passed (${(
      report.overall_pass_rate * 100
    ).toFixed(1)}%)` +
      (diff ? ` — Δ vs. baseline ${(diff.overall_delta * 100).toFixed(1)} pp` : ""),
  );
  lines.push("");
  lines.push(`Judge: \`${report.judge_model}\` · Cost: $${report.total_cost_usd.toFixed(4)}`);
  if (report.filter) lines.push(`Filter: \`${report.filter}\``);
  lines.push("");

  lines.push("## Per category");
  lines.push("");
  lines.push("| Category | Passed | Total | Pass rate |");
  lines.push("|----------|--------|-------|-----------|");
  for (const c of report.per_category) {
    lines.push(`| ${c.category} | ${c.passed} | ${c.total} | ${(c.pass_rate * 100).toFixed(1)}% |`);
  }
  lines.push("");

  if (report.per_tag.length > 0) {
    lines.push("## Per tag (top 20)");
    lines.push("");
    lines.push("| Tag | Passed | Total | Pass rate |");
    lines.push("|-----|--------|-------|-----------|");
    for (const t of report.per_tag.slice(0, 20)) {
      lines.push(
        `| \`${t.tag}\` | ${t.passed} | ${t.total} | ${(t.pass_rate * 100).toFixed(1)}% |`,
      );
    }
    lines.push("");
  }

  if (diff) {
    if (diff.newly_failing_case_ids.length > 0) {
      lines.push("## Newly FAILING vs. baseline");
      lines.push("");
      for (const id of diff.newly_failing_case_ids) lines.push(`- \`${id}\``);
      lines.push("");
    }
    if (diff.newly_passing_case_ids.length > 0) {
      lines.push("## Newly PASSING vs. baseline");
      lines.push("");
      for (const id of diff.newly_passing_case_ids) lines.push(`- \`${id}\``);
      lines.push("");
    }
  }

  const failing = report.cases.filter((r) => !r.passed);
  if (failing.length > 0) {
    lines.push("## Failing cases");
    lines.push("");
    for (const r of failing.slice(0, 20)) {
      lines.push(`### \`${r.id}\` — ${r.category}`);
      if (r.error) lines.push(`Error: \`${r.error}\``);
      for (const h of r.explicit_failure_hits) {
        lines.push(`- regex: \`${h.pattern}\` — ${h.message}`);
      }
      if (!r.json_shape_ok) lines.push(`- JSON shape check failed`);
      for (const j of r.tag_judgments) {
        if (!j.passed) lines.push(`- judge: \`${j.tag}\` — ${j.reasoning}`);
      }
      lines.push("");
    }
  }
  return lines.join("\n");
}

// ----------------------------------------------------------------------------
// helpers
// ----------------------------------------------------------------------------

function systemPromptFor(c: EvalCase): string {
  switch (c.category) {
    case "hint":
      return buildHintSystemPrompt(extractRung(c));
    case "grade":
      return buildGradeSystemPrompt();
    case "onboarding":
      return ONBOARDING_SYSTEM_PROMPT;
    case "session-plan":
      return SESSION_PLAN_SYSTEM_PROMPT;
    default:
      throw new Error(`Unsupported eval category: ${c.category satisfies never}`);
  }
}

function extractRung(c: EvalCase): 1 | 2 | 3 {
  const r = c.input.context["rung"];
  if (r === 1 || r === 2 || r === 3) return r;
  throw new Error(`Hint case ${c.id} missing context.rung (must be 1, 2, or 3).`);
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}
