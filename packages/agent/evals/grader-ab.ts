// STORY-034a — live-LLM A/B comparison for the grader split.
//
// For each transcript in `grade-split-vs-unified-live.json` we call the LLM TWICE:
//   1. with the unified-tutor grade prompt (`buildGradeSystemPrompt` from @learnpro/prompts)
//   2. with the split grader prompt (`buildGradeAgentSystemPrompt`, same path `gradeAgent` uses)
//
// The two responses are parsed (lenient) and three metrics computed across the sample set:
//   - idiomatic-score variance (range-normalized, same methodology as the STORY-034 deterministic
//     A/B test in `grade-split.test.ts`).
//   - distinct-bucket count on the idiomatic axis. Split is already integer 1-5; unified is binned
//     into 5 equal-width buckets [0.0,0.2), [0.2,0.4), [0.4,0.6), [0.6,0.8), [0.8,1.0] so the count
//     is apples-to-apples.
//   - tutor-commentary forbidden-phrase rate — the share of responses whose explanation text trips
//     a coach-voice forbidden-phrase regex (FOMO timers, fire emoji, leaderboard threats, etc.).
//
// Gated by `LEARNPRO_RUN_LIVE_LLM_EVAL=1` (matches STORY-035's opt-in live-LLM pattern). Default
// CI runs skip. Operator runs with `ANTHROPIC_API_KEY` set surface real numbers at ~$1-2/run.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ANTHROPIC_HAIKU, costFor, type ChatMessage, type LLMProvider } from "@learnpro/llm";
import {
  GRADE_PROMPT_VERSION,
  GRADE_PROMPT_VERSION_TAG,
  buildGradeAgentSystemPrompt,
  buildGradeAgentUserPrompt,
  buildGradeSystemPrompt,
  buildGradeUserPrompt,
} from "@learnpro/prompts";
import { z } from "zod";

const HERE = dirname(fileURLToPath(import.meta.url));
export const LIVE_AB_CASES_PATH = join(HERE, "cases", "grade-split-vs-unified-live.json");
export const LIVE_AB_REPORTS_DIR = join(HERE, "reports");

// ----------------------------------------------------------------------------
// Case-file schema
// ----------------------------------------------------------------------------

export const GraderAbTranscriptSchema = z.object({
  label: z
    .string()
    .min(3)
    .max(80)
    .regex(/^[a-z0-9-]+$/, "label must be kebab-case (lowercase + digits + hyphens)"),
  problem_name: z.string().min(1),
  problem_language: z.enum(["python", "typescript"]),
  problem_statement: z.string().min(1),
  user_code: z.string().min(1),
  total_tests: z.number().int().min(0),
  passed_tests: z.number().int().min(0),
  failing_test_summaries: z.array(z.string().min(1)).default([]),
  notes: z.string().optional(),
});
export type GraderAbTranscript = z.infer<typeof GraderAbTranscriptSchema>;

export const GraderAbCaseFileSchema = z.object({
  id: z.literal("grade-split-vs-unified-live"),
  story: z.literal("STORY-034a"),
  description: z.string().min(1),
  transcripts: z.array(GraderAbTranscriptSchema).min(5).max(20),
});
export type GraderAbCaseFile = z.infer<typeof GraderAbCaseFileSchema>;

// ----------------------------------------------------------------------------
// Result schema
// ----------------------------------------------------------------------------

// Coach-voice forbidden phrases — mirrors `@learnpro/notifications/copy.ts` /
// `comprehension-commentary.ts` so the report holds the grader's downstream tutor commentary to
// the same bar. We deliberately scan the grader's raw `reasoning` text too — even though the
// grader's output is internal, the tutor paraphrases it, and a "DAY 3" / "🔥" / "MUST" leak in
// the raw text is a signal the prompt is letting bad copy through.
const FORBIDDEN_PHRASES: ReadonlyArray<{ pattern: RegExp; label: string }> = [
  { pattern: /DON'?T\s+LOSE/i, label: "loss-aversion" },
  { pattern: /\bDAY\s+\d+\b/, label: "day-shouting" },
  { pattern: /🔥/, label: "fire-emoji" },
  { pattern: /⚠️/, label: "warning-emoji" },
  { pattern: /\bHURRY\b/i, label: "hurry-fomo" },
  { pattern: /\bMUST\s+/, label: "must-imperative" },
  { pattern: /leaderboard/i, label: "leaderboard" },
  { pattern: /\bgreat\s+(work|job|attempt)/i, label: "praise-great-work" },
  { pattern: /\bexcellent\b/i, label: "praise-excellent" },
  { pattern: /\bamazing\b/i, label: "praise-amazing" },
];

export function forbiddenPhrasesForGraderAb(): ReadonlyArray<{ pattern: RegExp; label: string }> {
  return FORBIDDEN_PHRASES;
}

export const UnifiedRubricSchema = z.object({
  correctness: z.number().min(0).max(1),
  idiomatic: z.number().min(0).max(1),
  edge_case_coverage: z.number().min(0).max(1),
});
export type UnifiedRubric = z.infer<typeof UnifiedRubricSchema>;

export const SplitRubricSchema = z.object({
  idiomatic: z.number().int().min(1).max(5),
  efficiency: z.number().int().min(1).max(5),
  test_coverage_thinking: z.number().int().min(1).max(5),
});
export type SplitRubric = z.infer<typeof SplitRubricSchema>;

export interface UnifiedSample {
  parsed: boolean;
  rubric?: UnifiedRubric;
  prose_explanation: string;
  raw_text: string;
  cost_usd: number;
  forbidden_phrase_labels: ReadonlyArray<string>;
}

export interface SplitSample {
  parsed: boolean;
  pass?: boolean;
  rubric?: SplitRubric;
  reasoning: string;
  raw_text: string;
  cost_usd: number;
  forbidden_phrase_labels: ReadonlyArray<string>;
}

export interface GraderAbSampleResult {
  label: string;
  unified: UnifiedSample;
  split: SplitSample;
}

export interface GraderAbMetrics {
  // Range-normalized variance on the idiomatic dimension. Unified is divided by 1 (range 1²);
  // split is divided by 16 (range 4²). Identical methodology to grade-split.test.ts.
  unified_idiomatic_variance_normalized: number;
  split_idiomatic_variance_normalized: number;
  // Distinct buckets used on the idiomatic axis. Unified continuous [0,1] is binned into 5
  // equal-width buckets so the count is apples-to-apples with split's integer 1-5.
  unified_idiomatic_distinct_buckets: number;
  split_idiomatic_distinct_buckets: number;
  // Share of samples whose explanation text tripped any forbidden-phrase regex.
  unified_forbidden_phrase_rate: number;
  split_forbidden_phrase_rate: number;
  // How many of N samples produced parsable output.
  unified_parsed_count: number;
  split_parsed_count: number;
  total_samples: number;
}

export interface GraderAbReport {
  version: "grader-ab-2026-05-11";
  generated_at: string;
  prompt_under_test_model: string;
  unified_prompt_version: string;
  split_prompt_version: string;
  total_cost_usd: number;
  samples: GraderAbSampleResult[];
  metrics: GraderAbMetrics;
}

// ----------------------------------------------------------------------------
// Case-file loading
// ----------------------------------------------------------------------------

export async function loadGraderAbCases(
  path: string = LIVE_AB_CASES_PATH,
): Promise<GraderAbCaseFile> {
  const raw = await readFile(path, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Grader A/B case file at ${path} is not valid JSON: ${(e as Error).message}`);
  }
  return GraderAbCaseFileSchema.parse(parsed);
}

// ----------------------------------------------------------------------------
// Lenient parsers (same shape as runner.ts's tryParseJsonObject + grade.ts's parseGraderResponse)
// ----------------------------------------------------------------------------

function tryParseJsonObject(text: string): Record<string, unknown> | null {
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    const value: unknown = JSON.parse(stripped);
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

export function parseUnifiedResponse(text: string): {
  rubric: UnifiedRubric;
  prose_explanation: string;
} | null {
  const obj = tryParseJsonObject(text);
  if (!obj) return null;
  const rubricRaw = obj["rubric"];
  const prose = obj["prose_explanation"];
  if (typeof prose !== "string" || prose.trim().length === 0) return null;
  if (!rubricRaw || typeof rubricRaw !== "object") return null;
  const candidate = UnifiedRubricSchema.safeParse(rubricRaw);
  if (!candidate.success) return null;
  return { rubric: candidate.data, prose_explanation: prose };
}

export function parseSplitResponse(text: string): {
  pass: boolean;
  rubric: SplitRubric;
  reasoning: string;
} | null {
  const obj = tryParseJsonObject(text);
  if (!obj) return null;
  if (typeof obj["pass"] !== "boolean") return null;
  if (typeof obj["reasoning"] !== "string" || obj["reasoning"].trim().length === 0) return null;
  const rubricRaw = obj["rubric"];
  if (!rubricRaw || typeof rubricRaw !== "object") return null;
  const r = rubricRaw as Record<string, unknown>;
  const idiomatic = coerceInt15(r["idiomatic"]);
  const efficiency = coerceInt15(r["efficiency"]);
  const test_coverage_thinking = coerceInt15(r["test_coverage_thinking"]);
  if (idiomatic === null || efficiency === null || test_coverage_thinking === null) return null;
  return {
    pass: obj["pass"],
    rubric: { idiomatic, efficiency, test_coverage_thinking },
    reasoning: obj["reasoning"],
  };
}

function coerceInt15(v: unknown): number | null {
  let n: number;
  if (typeof v === "number") n = v;
  else if (typeof v === "string") {
    const parsed = Number(v.trim());
    if (!Number.isFinite(parsed)) return null;
    n = parsed;
  } else return null;
  const rounded = Math.round(n);
  if (rounded < 1) return 1;
  if (rounded > 5) return 5;
  return rounded;
}

// ----------------------------------------------------------------------------
// Metrics
// ----------------------------------------------------------------------------

function variance(samples: ReadonlyArray<number>): number {
  if (samples.length === 0) return 0;
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  const sumSq = samples.reduce((a, b) => a + (b - mean) ** 2, 0);
  return sumSq / samples.length;
}

// Bin unified [0,1] into 5 equal-width buckets so we can compare its distinct-bucket count head
// to head with the split's integer 1-5. Width 0.2; 1.0 is folded into the top bucket.
export function binUnifiedIdiomatic(score: number): 1 | 2 | 3 | 4 | 5 {
  if (score >= 1.0) return 5;
  if (score >= 0.8) return 5;
  if (score >= 0.6) return 4;
  if (score >= 0.4) return 3;
  if (score >= 0.2) return 2;
  return 1;
}

export function scanForbiddenPhrases(text: string): string[] {
  const labels: string[] = [];
  for (const { pattern, label } of FORBIDDEN_PHRASES) {
    if (pattern.test(text)) labels.push(label);
  }
  return labels;
}

export function computeGraderAbMetrics(
  samples: ReadonlyArray<GraderAbSampleResult>,
): GraderAbMetrics {
  const unifiedIdiomatic: number[] = [];
  const splitIdiomatic: number[] = [];
  const unifiedBuckets = new Set<number>();
  const splitBuckets = new Set<number>();
  let unifiedForbiddenCount = 0;
  let splitForbiddenCount = 0;
  let unifiedParsed = 0;
  let splitParsed = 0;

  for (const s of samples) {
    if (s.unified.rubric) {
      unifiedIdiomatic.push(s.unified.rubric.idiomatic);
      unifiedBuckets.add(binUnifiedIdiomatic(s.unified.rubric.idiomatic));
      unifiedParsed += 1;
    }
    if (s.unified.forbidden_phrase_labels.length > 0) unifiedForbiddenCount += 1;
    if (s.split.rubric) {
      splitIdiomatic.push(s.split.rubric.idiomatic);
      splitBuckets.add(s.split.rubric.idiomatic);
      splitParsed += 1;
    }
    if (s.split.forbidden_phrase_labels.length > 0) splitForbiddenCount += 1;
  }

  return {
    unified_idiomatic_variance_normalized: round6(variance(unifiedIdiomatic) / 1),
    split_idiomatic_variance_normalized: round6(variance(splitIdiomatic) / 16),
    unified_idiomatic_distinct_buckets: unifiedBuckets.size,
    split_idiomatic_distinct_buckets: splitBuckets.size,
    unified_forbidden_phrase_rate:
      samples.length === 0 ? 0 : round6(unifiedForbiddenCount / samples.length),
    split_forbidden_phrase_rate:
      samples.length === 0 ? 0 : round6(splitForbiddenCount / samples.length),
    unified_parsed_count: unifiedParsed,
    split_parsed_count: splitParsed,
    total_samples: samples.length,
  };
}

// ----------------------------------------------------------------------------
// A/B runner
// ----------------------------------------------------------------------------

export interface RunGraderAbOptions {
  llm: LLMProvider;
  cases: GraderAbCaseFile;
  prompt_under_test_model?: string;
  onProgress?: (line: string) => void;
  now?: () => number;
}

export async function runGraderAb(opts: RunGraderAbOptions): Promise<GraderAbReport> {
  const onProgress = opts.onProgress ?? ((line: string) => console.log(line));
  const now = opts.now ?? (() => Date.now());
  const model = opts.prompt_under_test_model ?? ANTHROPIC_HAIKU;

  const samples: GraderAbSampleResult[] = [];
  let totalCost = 0;

  onProgress(
    `[grader-ab] running ${opts.cases.transcripts.length} transcript(s) on model=${model}…`,
  );

  for (let i = 0; i < opts.cases.transcripts.length; i++) {
    const t = opts.cases.transcripts[i]!;
    onProgress(`[grader-ab] (${i + 1}/${opts.cases.transcripts.length}) ${t.label}`);

    const unified = await runUnifiedOnce(opts.llm, t, model);
    const split = await runSplitOnce(opts.llm, t, model);
    totalCost += unified.cost_usd + split.cost_usd;

    samples.push({ label: t.label, unified, split });

    onProgress(
      `[grader-ab]   → unified parsed=${unified.parsed}, split parsed=${split.parsed}, ` +
        `cost so far=$${totalCost.toFixed(4)}`,
    );
  }

  const metrics = computeGraderAbMetrics(samples);
  const report: GraderAbReport = {
    version: "grader-ab-2026-05-11",
    generated_at: new Date(now()).toISOString(),
    prompt_under_test_model: model,
    unified_prompt_version: GRADE_PROMPT_VERSION_TAG,
    split_prompt_version: GRADE_PROMPT_VERSION,
    total_cost_usd: round6(totalCost),
    samples,
    metrics,
  };
  onProgress(
    `[grader-ab] done. cost=$${totalCost.toFixed(4)}. ` +
      `unified variance=${metrics.unified_idiomatic_variance_normalized}, ` +
      `split variance=${metrics.split_idiomatic_variance_normalized}.`,
  );
  return report;
}

async function runUnifiedOnce(
  llm: LLMProvider,
  t: GraderAbTranscript,
  model: string,
): Promise<UnifiedSample> {
  const system = buildGradeSystemPrompt();
  const userMsg = buildGradeUserPrompt({
    problem_name: t.problem_name,
    problem_language: t.problem_language,
    problem_statement: t.problem_statement,
    user_code: t.user_code,
    total_tests: t.total_tests,
    passed_tests: t.passed_tests,
    failing_test_summaries: t.failing_test_summaries,
  });
  const messages: ChatMessage[] = [{ role: "user", content: userMsg }];
  const res = await llm.complete({
    messages,
    system,
    model,
    max_tokens: 500,
    temperature: 0.2,
    prompt_version: GRADE_PROMPT_VERSION_TAG,
  });
  const cost = costFor({
    model: res.model,
    input_tokens: res.usage.input_tokens,
    output_tokens: res.usage.output_tokens,
  }).cost_usd;
  const parsed = parseUnifiedResponse(res.text);
  const proseForScan = parsed?.prose_explanation ?? res.text;
  return {
    parsed: parsed !== null,
    ...(parsed?.rubric ? { rubric: parsed.rubric } : {}),
    prose_explanation: parsed?.prose_explanation ?? "",
    raw_text: truncate(res.text, 2000),
    cost_usd: round6(cost),
    forbidden_phrase_labels: scanForbiddenPhrases(proseForScan),
  };
}

async function runSplitOnce(
  llm: LLMProvider,
  t: GraderAbTranscript,
  model: string,
): Promise<SplitSample> {
  const system = buildGradeAgentSystemPrompt();
  const userMsg = buildGradeAgentUserPrompt({
    problem_name: t.problem_name,
    problem_language: t.problem_language,
    problem_statement: t.problem_statement,
    user_code: t.user_code,
    total_tests: t.total_tests,
    passed_tests: t.passed_tests,
    failing_test_summaries: t.failing_test_summaries,
  });
  const messages: ChatMessage[] = [{ role: "user", content: userMsg }];
  const res = await llm.complete({
    messages,
    system,
    model,
    max_tokens: 500,
    temperature: 0.2,
    prompt_version: GRADE_PROMPT_VERSION,
    role: "grader",
  });
  const cost = costFor({
    model: res.model,
    input_tokens: res.usage.input_tokens,
    output_tokens: res.usage.output_tokens,
  }).cost_usd;
  const parsed = parseSplitResponse(res.text);
  const reasoningForScan = parsed?.reasoning ?? res.text;
  return {
    parsed: parsed !== null,
    ...(parsed && { pass: parsed.pass }),
    ...(parsed?.rubric ? { rubric: parsed.rubric } : {}),
    reasoning: parsed?.reasoning ?? "",
    raw_text: truncate(res.text, 2000),
    cost_usd: round6(cost),
    forbidden_phrase_labels: scanForbiddenPhrases(reasoningForScan),
  };
}

// ----------------------------------------------------------------------------
// Env-flag gating + markdown report
// ----------------------------------------------------------------------------

export const LIVE_LLM_EVAL_ENV = "LEARNPRO_RUN_LIVE_LLM_EVAL";

export function liveLlmEvalEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[LIVE_LLM_EVAL_ENV] === "1";
}

export function renderGraderAbMarkdown(report: GraderAbReport): string {
  const lines: string[] = [];
  const m = report.metrics;
  lines.push(`# Grader split A/B — ${report.generated_at}`);
  lines.push("");
  lines.push(`Model: \`${report.prompt_under_test_model}\``);
  lines.push(`Unified prompt: \`${report.unified_prompt_version}\``);
  lines.push(`Split prompt: \`${report.split_prompt_version}\``);
  lines.push(`Total cost: $${report.total_cost_usd.toFixed(4)}`);
  lines.push("");
  lines.push("## Headline metrics");
  lines.push("");
  lines.push("| Metric | Unified | Split |");
  lines.push("|---|---|---|");
  lines.push(
    `| Idiomatic variance (range-normalized) | ${m.unified_idiomatic_variance_normalized} | ${m.split_idiomatic_variance_normalized} |`,
  );
  lines.push(
    `| Distinct idiomatic buckets (of 5) | ${m.unified_idiomatic_distinct_buckets} | ${m.split_idiomatic_distinct_buckets} |`,
  );
  lines.push(
    `| Forbidden-phrase rate | ${(m.unified_forbidden_phrase_rate * 100).toFixed(1)}% | ${(m.split_forbidden_phrase_rate * 100).toFixed(1)}% |`,
  );
  lines.push(
    `| Parsed responses | ${m.unified_parsed_count}/${m.total_samples} | ${m.split_parsed_count}/${m.total_samples} |`,
  );
  lines.push("");
  lines.push("## Per-sample rubric");
  lines.push("");
  lines.push("| Label | Unified idiomatic | Split idiomatic | Split efficiency | Split test_cov |");
  lines.push("|---|---|---|---|---|");
  for (const s of report.samples) {
    const u = s.unified.rubric ? s.unified.rubric.idiomatic.toFixed(2) : "—";
    const si = s.split.rubric?.idiomatic ?? "—";
    const se = s.split.rubric?.efficiency ?? "—";
    const st = s.split.rubric?.test_coverage_thinking ?? "—";
    lines.push(`| ${s.label} | ${u} | ${si} | ${se} | ${st} |`);
  }
  lines.push("");
  return lines.join("\n");
}

export async function writeGraderAbReport(
  report: GraderAbReport,
  dir: string = LIVE_AB_REPORTS_DIR,
  now: () => number = () => Date.now(),
): Promise<string> {
  await mkdir(dir, { recursive: true });
  const d = new Date(now());
  const stamp = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(
    d.getUTCDate(),
  ).padStart(2, "0")}`;
  const path = join(dir, `grade-split-ab-${stamp}.md`);
  await writeFile(path, renderGraderAbMarkdown(report), "utf8");
  return path;
}

// ----------------------------------------------------------------------------
// helpers
// ----------------------------------------------------------------------------

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}
