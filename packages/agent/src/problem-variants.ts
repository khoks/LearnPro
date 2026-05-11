// STORY-039 — LLM-generated problem variants on top of the curated seed bank.
// STORY-039a — wires `validateProblem` from `@learnpro/problems` into the pipeline so a
// variant whose `reference_solution` doesn't pass its own `hidden_tests` is dropped before
// it can be cached or surfaced to a user.
// STORY-039d — wires an optional LLM-judge spec-clarity rubric: after the structural Zod
// gate (STORY-039) and (when wired) Piston self-validation (STORY-039a), the judge scores
// the variant 1-5 on instruction_clarity / example_quality / concept_match. Variants with
// `min(scores) < 3` are dropped via a new `variants_dropped_spec_clarity` telemetry
// counter.
//
// `generateProblemVariant` is a pure function: given an LLMProvider (and optionally a
// SandboxProvider + spec-clarity judge), it asks Haiku for a variant, parses the JSON
// output, validates against `ProblemDefSchema`, optionally runs the variant's reference
// solution against its own hidden_tests through the sandbox, optionally runs a second LLM
// judge for spec clarity, and returns the parsed list. Failed parses (invalid JSON,
// schema-failing variants) are dropped — the agent retries once with an augmented "fix the
// previous variant" prompt and then returns whatever passed validation, which may be empty.
//
// Design intent (STORY-039 + STORY-039a + STORY-039d):
//   - Cheap: Haiku, capped output tokens, single retry per source. The spec-clarity judge
//     adds at most one extra Haiku call per variant (~$0.01) when wired.
//   - Pure: doesn't talk to the DB. The route handler owns persistence and decides whether
//     to wire the sandbox (the env flag `LEARNPRO_VARIANT_SELF_VALIDATE` lives in the route)
//     or the judge (`LEARNPRO_VARIANT_SPEC_CLARITY_JUDGE`).
//   - Strict at the boundary: the LLM output is run through `ProblemDefSchema.parse` so a
//     row that lands in the `problem_variants` cache is interchangeable with a YAML.
//   - Self-validating: when a sandbox is wired, the variant's reference_solution must pass
//     all of its own hidden_tests before being returned. This is AC #3 of STORY-039 and the
//     reason malformed variants no longer ship.
//   - Spec-clarity-judged: when a judge is wired, the variant's statement + examples +
//     concept_tags must score >= 3 on each rubric criterion. Closes AC #3's spec-clarity
//     gap (the part the Zod + Piston gates don't cover).
//   - Best-effort: the function never throws. On every failure mode (LLM blank, JSON fail,
//     Zod fail, validator fail twice, judge drop twice) the result is
//     `{ variants: [], fallback_used: true }` and the route returns 200 with an empty list
//     so the UI can show an empty state.

import type { LLMProvider } from "@learnpro/llm";
import { ANTHROPIC_HAIKU } from "@learnpro/llm";
import {
  ProblemDefSchema,
  isImplementProblem,
  validateProblem,
  type ImplementProblemDef,
  type ProblemDef,
  type ProblemValidationResult,
} from "@learnpro/problems";
import {
  PROBLEM_VARIANTS_PROMPT_VERSION,
  buildProblemVariantsSystemPrompt,
  buildProblemVariantsUserPrompt,
  type ProblemVariantsPromptSourceShape,
} from "@learnpro/prompts";
import type { SandboxProvider } from "@learnpro/sandbox";
import type {
  SpecClarityJudge,
  VariantSpecClarityResult,
} from "./variant-spec-clarity-judge.js";

// STORY-039a — telemetry callback. The route surfaces these counts to logs / metrics; the
// agent stays pure (no global state). All counters are per-source (one call to
// `generateProblemVariant`); the route may aggregate over a session if it wishes.
//
// STORY-039d adds `variants_dropped_spec_clarity` — emitted when the LLM-judge spec-clarity
// rubric drops the variant. Separate from `variants_dropped_fail` (which is for sandbox
// self-validation failures) so operators can attribute drops to the right gate.
export interface ProblemVariantsTelemetry {
  // Emitted once per source-problem call when the LLM produced a structurally valid variant
  // (passed `parseProblemVariantResponse`). Counts both attempts that reached this point.
  variants_generated: (event: { slug: string; source_slug: string; attempt: number }) => void;
  // Emitted when a structurally valid variant also passed self-validation (reference_solution
  // ran against hidden_tests in the sandbox) AND (when wired) the spec-clarity judge.
  variants_validated_pass: (event: { slug: string; source_slug: string; attempt: number }) => void;
  // Emitted when self-validation failed. The dropped variant + first failure detail are
  // surfaced so an operator can inspect later (no DB persistence in v1 — log-only).
  variants_dropped_fail: (event: {
    slug: string;
    source_slug: string;
    attempt: number;
    failures: ProblemValidationResult["failures"];
  }) => void;
  // STORY-039d — emitted when the LLM-judge spec-clarity rubric drops the variant. The
  // judge's per-criterion scores + reasoning are surfaced so an operator can inspect later.
  variants_dropped_spec_clarity: (event: {
    slug: string;
    source_slug: string;
    attempt: number;
    judge: VariantSpecClarityResult;
  }) => void;
}

export interface GenerateProblemVariantInput {
  llm: LLMProvider;
  user_id: string;
  source: ImplementProblemDef;
  // Number of variants to generate. v1 only supports 1; the field is here so the route
  // and agent can grow to N without a breaking change.
  count?: number;
  // Override the default Haiku model — used by tests + future operator tuning.
  model?: string;
  // STORY-039a — when wired, every parsed variant runs `validateProblem` against its own
  // hidden_tests before being returned. Omit (route-controlled via the
  // `LEARNPRO_VARIANT_SELF_VALIDATE` env flag) to skip validation and behave as STORY-039.
  sandbox?: SandboxProvider;
  // STORY-039a — optional time budget per hidden-test execution (passed straight through to
  // `validateProblem`). Defaults to the validate.ts default (5_000 ms) when omitted.
  validation_time_limit_ms?: number;
  // STORY-039d — optional LLM-judge spec-clarity rubric. When wired, every parsed variant
  // is scored 1-5 on instruction_clarity / example_quality / concept_match. Variants where
  // `min(scores) < 3` are dropped and a `variants_dropped_spec_clarity` counter fires.
  // Caller-controlled (route reads `LEARNPRO_VARIANT_SPEC_CLARITY_JUDGE`). Omit to skip the
  // judge entirely and behave as STORY-039a.
  judge?: SpecClarityJudge;
  // STORY-039a — optional structured telemetry callbacks. Each is called best-effort; throws
  // are swallowed so a sink hiccup never blocks variant generation.
  onTelemetry?: Partial<ProblemVariantsTelemetry>;
}

export interface GenerateProblemVariantOutput {
  variants: ProblemDef[];
  // True when the agent fell back to an empty list because every attempt failed Zod
  // validation (or self-validation when the sandbox is wired). The route surfaces this so
  // the UI can show a warm "couldn't produce a variant — try again later" empty state.
  fallback_used: boolean;
}

const MAX_RETRIES = 1;
const DEFAULT_COUNT = 1;
const MAX_COUNT = 5;

export async function generateProblemVariant(
  input: GenerateProblemVariantInput,
): Promise<GenerateProblemVariantOutput> {
  if (!isImplementProblem(input.source)) {
    return { variants: [], fallback_used: true };
  }
  const count = clampCount(input.count ?? DEFAULT_COUNT);

  const variants: ProblemDef[] = [];
  const usedSlugs = new Set<string>();

  for (let i = 1; i <= count; i++) {
    const variant = await tryGenerateOne({
      llm: input.llm,
      user_id: input.user_id,
      source: input.source,
      variant_index: i,
      model: input.model,
      already_used_slugs: usedSlugs,
      sandbox: input.sandbox,
      validation_time_limit_ms: input.validation_time_limit_ms,
      judge: input.judge,
      onTelemetry: input.onTelemetry,
    });
    if (variant) {
      variants.push(variant);
      usedSlugs.add(variant.slug);
    }
  }

  return {
    variants,
    fallback_used: variants.length === 0,
  };
}

interface TryGenerateOneInput {
  llm: LLMProvider;
  user_id: string;
  source: ImplementProblemDef;
  variant_index: number;
  model?: string;
  already_used_slugs: Set<string>;
  sandbox?: SandboxProvider;
  validation_time_limit_ms?: number;
  judge?: SpecClarityJudge;
  onTelemetry?: Partial<ProblemVariantsTelemetry>;
}

// STORY-039a — the retry loop carries the previous attempt's failing variant + reason so the
// second LLM call can be steered with a "fix the bug in your previous variant" prompt.
// STORY-039d — adds a second gate (the spec-clarity judge) that runs after sandbox
// self-validation. A judge drop counts toward the same retry budget; persistent failure
// drops the variant entirely.
async function tryGenerateOne(input: TryGenerateOneInput): Promise<ProblemDef | null> {
  let previousFailure: PreviousFailure | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const variant_index = input.variant_index + attempt;
    const variant = await callOnce({
      llm: input.llm,
      user_id: input.user_id,
      source: input.source,
      variant_index,
      ...(input.model !== undefined ? { model: input.model } : {}),
      ...(previousFailure !== null ? { previous_failure: previousFailure } : {}),
    });
    if (!variant) continue;
    if (input.already_used_slugs.has(variant.slug)) continue;

    safeFire(input.onTelemetry?.variants_generated, {
      slug: variant.slug,
      source_slug: input.source.slug,
      attempt: attempt + 1,
    });

    if (input.sandbox !== undefined) {
      const validation = await runSelfValidation({
        variant,
        sandbox: input.sandbox,
        ...(input.validation_time_limit_ms !== undefined
          ? { time_limit_ms: input.validation_time_limit_ms }
          : {}),
      });
      if (!validation.passed) {
        safeFire(input.onTelemetry?.variants_dropped_fail, {
          slug: variant.slug,
          source_slug: input.source.slug,
          attempt: attempt + 1,
          failures: validation.failures,
        });
        previousFailure = {
          kind: "self_validation",
          variant,
          failures: validation.failures,
        };
        continue;
      }
    }

    if (input.judge !== undefined) {
      const judgeResult = await runJudgeSafely(input.judge, variant);
      if (!judgeResult.pass) {
        safeFire(input.onTelemetry?.variants_dropped_spec_clarity, {
          slug: variant.slug,
          source_slug: input.source.slug,
          attempt: attempt + 1,
          judge: judgeResult,
        });
        previousFailure = {
          kind: "spec_clarity",
          variant,
          judge: judgeResult,
        };
        continue;
      }
    }

    safeFire(input.onTelemetry?.variants_validated_pass, {
      slug: variant.slug,
      source_slug: input.source.slug,
      attempt: attempt + 1,
    });
    return variant;
  }
  return null;
}

// STORY-039a / STORY-039d — a previous-attempt failure carries the variant that failed
// plus a discriminated payload describing WHY (sandbox self-validation or spec-clarity
// judge). The retry-prompt addendum picks a corrective phrasing per kind.
type PreviousFailure =
  | {
      kind: "self_validation";
      variant: ProblemDef;
      failures: ProblemValidationResult["failures"];
    }
  | {
      kind: "spec_clarity";
      variant: ProblemDef;
      judge: VariantSpecClarityResult;
    };

interface CallOnceInput {
  llm: LLMProvider;
  user_id: string;
  source: ImplementProblemDef;
  variant_index: number;
  model?: string;
  previous_failure?: PreviousFailure;
}

async function callOnce(input: CallOnceInput): Promise<ProblemDef | null> {
  const promptSource: ProblemVariantsPromptSourceShape = {
    slug: input.source.slug,
    name: input.source.name,
    language: input.source.language,
    difficulty: input.source.difficulty,
    track: input.source.track,
    concept_tags: input.source.concept_tags,
    statement: input.source.statement,
    starter_code: input.source.starter_code,
    reference_solution: input.source.reference_solution,
    public_examples: input.source.public_examples,
    hidden_tests: input.source.hidden_tests,
    expected_median_time_to_solve_ms: input.source.expected_median_time_to_solve_ms,
  };

  const system = buildProblemVariantsSystemPrompt();
  const user = buildProblemVariantsUserPrompt({
    source: promptSource,
    variant_index: input.variant_index,
  });

  // STORY-039a — when the previous attempt produced a structurally valid variant whose
  // reference_solution failed its own hidden_tests, append a corrective addendum to the user
  // prompt. The guidance is factual + concise (matches the system prompt's tone rules).
  const userWithCorrection =
    input.previous_failure !== undefined
      ? `${user}\n\n${buildPreviousFailureAddendum(input.previous_failure)}`
      : user;

  const res = await input.llm.complete({
    messages: [{ role: "user", content: userWithCorrection }],
    system,
    model: input.model ?? ANTHROPIC_HAIKU,
    role: "reflection",
    max_tokens: 2400,
    temperature: 0.6,
    prompt_version: PROBLEM_VARIANTS_PROMPT_VERSION,
    user_id: input.user_id,
  });

  return parseProblemVariantResponse(res.text, input.source);
}

// STORY-039a — runs the variant's reference_solution against its own hidden_tests in the
// sandbox. Wraps `validateProblem` and never throws — a sandbox hiccup is treated as a
// validation failure so the agent retries (or drops) cleanly.
interface RunSelfValidationInput {
  variant: ProblemDef;
  sandbox: SandboxProvider;
  time_limit_ms?: number;
}

async function runSelfValidation(input: RunSelfValidationInput): Promise<ProblemValidationResult> {
  try {
    return await validateProblem(input.variant, input.sandbox, {
      ...(input.time_limit_ms !== undefined ? { time_limit_ms: input.time_limit_ms } : {}),
    });
  } catch (err) {
    return {
      slug: input.variant.slug,
      language: input.variant.language,
      passed: false,
      failures: [
        {
          test_index: 0,
          reason: "exception",
          detail: `validateProblem threw: ${(err as Error).message}`,
        },
      ],
    };
  }
}

function buildPreviousFailureAddendum(prev: PreviousFailure): string {
  if (prev.kind === "self_validation") {
    const first = prev.failures[0];
    const detail = first ? `${first.reason}: ${first.detail}` : "unknown failure";
    // We surface the failing reference_solution + the first hidden-test failure so the model
    // can reason about the bug without us re-shipping every test case verbatim. Keep this
    // section short — Haiku output budget is 2400 tokens and we want most of it for the new
    // variant.
    return [
      "Your previous variant attempt did not pass its own hidden_tests. Fix the bug in the",
      "reference_solution OR adjust the hidden_tests so they match the corrected solution.",
      "Then emit a fresh variant JSON object using the same schema.",
      "",
      "Previous variant slug:",
      prev.variant.slug,
      "",
      "Previous reference_solution:",
      "```",
      "reference_solution" in prev.variant ? prev.variant.reference_solution : "",
      "```",
      "",
      `First failure (test index ${first?.test_index ?? 0}): ${detail}`,
    ].join("\n");
  }

  // STORY-039d — spec-clarity judge drop. Steer the retry toward whichever criterion
  // scored lowest so the model focuses its rewrite there.
  const judge = prev.judge;
  const lowest = lowestCriterion(judge);
  return [
    "Your previous variant attempt passed structural validation but failed the spec-clarity",
    "review. Rewrite the statement and examples so the spec is unambiguous and every declared",
    "concept_tag is genuinely exercised. Then emit a fresh variant JSON object using the same",
    "schema.",
    "",
    "Previous variant slug:",
    prev.variant.slug,
    "",
    `Lowest-scoring criterion (${lowest.name}): ${lowest.score}/5 — ${lowest.reasoning}`,
    `instruction_clarity: ${judge.instruction_clarity}/5 — ${judge.reasoning.instruction_clarity}`,
    `example_quality: ${judge.example_quality}/5 — ${judge.reasoning.example_quality}`,
    `concept_match: ${judge.concept_match}/5 — ${judge.reasoning.concept_match}`,
  ].join("\n");
}

// STORY-039d — best-effort judge wrapper. The pure judge already swallows LLM errors and
// returns a synthetic `{ pass: false }`; this wrapper adds a belt-and-braces try/catch in
// case a custom judge implementation throws unexpectedly. Mirrors `runSelfValidation`'s
// pattern for sandbox outages.
async function runJudgeSafely(
  judge: SpecClarityJudge,
  variant: ProblemDef,
): Promise<VariantSpecClarityResult> {
  try {
    return await judge(variant);
  } catch {
    return {
      instruction_clarity: 1,
      example_quality: 1,
      concept_match: 1,
      reasoning: {
        instruction_clarity: "spec-clarity judge threw",
        example_quality: "spec-clarity judge threw",
        concept_match: "spec-clarity judge threw",
      },
      pass: false,
    };
  }
}

function lowestCriterion(j: VariantSpecClarityResult): {
  name: "instruction_clarity" | "example_quality" | "concept_match";
  score: number;
  reasoning: string;
} {
  const items: Array<{
    name: "instruction_clarity" | "example_quality" | "concept_match";
    score: number;
    reasoning: string;
  }> = [
    {
      name: "instruction_clarity",
      score: j.instruction_clarity,
      reasoning: j.reasoning.instruction_clarity,
    },
    { name: "example_quality", score: j.example_quality, reasoning: j.reasoning.example_quality },
    { name: "concept_match", score: j.concept_match, reasoning: j.reasoning.concept_match },
  ];
  return items.reduce((lo, cur) => (cur.score < lo.score ? cur : lo));
}

// Parses the LLM output and runs it through `ProblemDefSchema.parse`. Returns null on any
// failure (invalid JSON, schema-failing variant, or — defense-in-depth — a variant that
// drifted in language / difficulty / concept_tags away from the source). The caller retries
// once on null and then surfaces an empty list.
export function parseProblemVariantResponse(
  text: string,
  source: ImplementProblemDef,
): ProblemDef | null {
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  if (stripped.length === 0) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(stripped);
  } catch {
    return null;
  }
  const parsed = ProblemDefSchema.safeParse(raw);
  if (!parsed.success) return null;
  const variant = parsed.data;
  // Defense-in-depth: a variant that doesn't match the source's language / difficulty /
  // concept_tags / track / kind is a model failure mode — drop it.
  if (variant.kind !== "implement") return null;
  if (variant.language !== source.language) return null;
  if (variant.difficulty !== source.difficulty) return null;
  if (variant.track !== source.track) return null;
  if (!arraysEqual(variant.concept_tags, source.concept_tags)) return null;
  // Slug must reference the source — guards against the model rewriting an unrelated problem.
  if (!variant.slug.startsWith(`${source.slug}-variant-`)) return null;
  // `variant_of` (if present) must point back at the source.
  if (variant.variant_of !== undefined && variant.variant_of !== source.slug) return null;
  return variant;
}

// STORY-039a — fire-and-forget telemetry. A throwing sink must never block variant
// generation; we swallow the error rather than try/catch each emit at every call site.
function safeFire<T>(fn: ((e: T) => void) | undefined, event: T): void {
  if (fn === undefined) return;
  try {
    fn(event);
  } catch {
    // intentional drop — telemetry is fire-and-forget
  }
}

function arraysEqual<T>(a: ReadonlyArray<T>, b: ReadonlyArray<T>): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function clampCount(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_COUNT;
  const rounded = Math.floor(n);
  if (rounded < 1) return 1;
  if (rounded > MAX_COUNT) return MAX_COUNT;
  return rounded;
}
