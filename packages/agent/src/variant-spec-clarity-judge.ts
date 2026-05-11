// STORY-039d — pure agent that runs a Haiku-based LLM judge over a structurally valid
// problem variant and returns 1-5 scores on three spec-clarity criteria.
//
// The judge runs AFTER the structural Zod gate (STORY-039) and AFTER (when wired) Piston
// self-validation (STORY-039a). It catches the failure modes those cheaper gates miss:
//   - ambiguous statements that pass the schema but leave the learner guessing
//   - examples that contradict the spec
//   - concept_tag mismatches between the declared tags and what the exercise actually
//     measures
//
// Design intent:
//   - Pure: no DB, no telemetry, no side effects. The caller (the agent's variant pipeline)
//     decides what to do with `{ pass: false }`.
//   - Best-effort: never throws. Parse failure / Zod failure / transient LLM error → single
//     retry → on persistent failure return `{ pass: false }` with a synthetic reasoning. A
//     judge outage must never block the variant pipeline from returning what it has.
//   - `pass = min(instruction_clarity, example_quality, concept_match) >= 3`. A single
//     low-clarity score is enough to drop the variant.

import { z } from "zod";
import type { LLMProvider } from "@learnpro/llm";
import { ANTHROPIC_HAIKU } from "@learnpro/llm";
import { isImplementProblem, type ProblemDef } from "@learnpro/problems";
import {
  VARIANT_SPEC_CLARITY_PROMPT_VERSION,
  buildVariantSpecClaritySystemPrompt,
  buildVariantSpecClarityUserPrompt,
  type VariantSpecClarityPromptVariant,
} from "@learnpro/prompts";

// Minimum per-criterion score required to keep a variant. A single score below this drops
// the variant.
export const VARIANT_SPEC_CLARITY_MIN_PASSING = 3;

const MAX_RETRIES = 1;

const RubricScoreSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);

export const VariantSpecClarityReasoningSchema = z.object({
  instruction_clarity: z.string().min(1),
  example_quality: z.string().min(1),
  concept_match: z.string().min(1),
});

export const VariantSpecClarityResultSchema = z.object({
  instruction_clarity: RubricScoreSchema,
  example_quality: RubricScoreSchema,
  concept_match: RubricScoreSchema,
  reasoning: VariantSpecClarityReasoningSchema,
  pass: z.boolean(),
});

export type VariantSpecClarityScore = z.infer<typeof RubricScoreSchema>;
export type VariantSpecClarityReasoning = z.infer<typeof VariantSpecClarityReasoningSchema>;
export type VariantSpecClarityResult = z.infer<typeof VariantSpecClarityResultSchema>;

// Internal schema for the raw LLM response (no `pass` field — the wrapper computes it from
// the three scores).
const ResponseSchema = z.object({
  instruction_clarity: RubricScoreSchema,
  example_quality: RubricScoreSchema,
  concept_match: RubricScoreSchema,
  reasoning: VariantSpecClarityReasoningSchema,
});

export interface RunVariantSpecClarityJudgeInput {
  llm: LLMProvider;
  variant: ProblemDef;
  user_id?: string;
  // Override the default Haiku model — used by tests + future operator tuning.
  model?: string;
}

// Pure judge call. Returns `{ pass: false }` synthetically on any parse / Zod / LLM failure
// so the caller can use a single drop-if-not-pass pattern. Never throws.
export async function runVariantSpecClarityJudge(
  input: RunVariantSpecClarityJudgeInput,
): Promise<VariantSpecClarityResult> {
  // Defensive guard — the prompt only fits implement-kind variants. Comprehension / debug
  // variants are out of v1 scope for the variant pipeline, but if a future caller passes
  // one we fail soft.
  if (!isImplementProblem(input.variant)) {
    return synthesizeFailureResult("variant kind not supported by the spec-clarity judge");
  }

  const promptVariant: VariantSpecClarityPromptVariant = {
    name: input.variant.name,
    statement: input.variant.statement,
    concept_tags: input.variant.concept_tags,
    public_examples: input.variant.public_examples,
    hidden_tests: input.variant.hidden_tests,
  };

  const system = buildVariantSpecClaritySystemPrompt();
  const user = buildVariantSpecClarityUserPrompt({ variant: promptVariant });

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let res;
    try {
      res = await input.llm.complete({
        messages: [{ role: "user", content: user }],
        system,
        model: input.model ?? ANTHROPIC_HAIKU,
        role: "reflection",
        max_tokens: 400,
        temperature: 0,
        prompt_version: VARIANT_SPEC_CLARITY_PROMPT_VERSION,
        ...(input.user_id !== undefined ? { user_id: input.user_id } : {}),
      });
    } catch {
      // Transient LLM failure — let the loop retry. If we exhaust retries we fall through
      // to the synthesized failure below.
      continue;
    }

    const parsed = parseVariantSpecClarityResponse(res.text);
    if (parsed !== null) return parsed;
  }

  return synthesizeFailureResult("judge response did not parse");
}

// Pure parser. Strips optional markdown fences, runs JSON.parse + Zod, and computes the
// `pass` flag from the three scores. Returns null on any failure so the caller can retry.
export function parseVariantSpecClarityResponse(text: string): VariantSpecClarityResult | null {
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

  const parsed = ResponseSchema.safeParse(raw);
  if (!parsed.success) return null;

  const { instruction_clarity, example_quality, concept_match, reasoning } = parsed.data;
  const pass =
    Math.min(instruction_clarity, example_quality, concept_match) >=
    VARIANT_SPEC_CLARITY_MIN_PASSING;

  return {
    instruction_clarity,
    example_quality,
    concept_match,
    reasoning,
    pass,
  };
}

// Synthesize a failure result used when the LLM is unreachable or returns garbage. The
// `pass: false` is what the caller acts on; the rubric scores carry the minimum so that any
// downstream consumer that aggregates judge scores doesn't pull in a misleading high score.
function synthesizeFailureResult(reason: string): VariantSpecClarityResult {
  return {
    instruction_clarity: 1,
    example_quality: 1,
    concept_match: 1,
    reasoning: {
      instruction_clarity: reason,
      example_quality: reason,
      concept_match: reason,
    },
    pass: false,
  };
}

// Convenience type for the optional `judge` parameter passed to `generateProblemVariant`.
// The agent calls `judge(variant)` and inspects only `result.pass`; this lets a future
// caller swap in a stub / deterministic judge for tests without re-deriving the full
// LLMProvider surface.
export type SpecClarityJudge = (variant: ProblemDef) => Promise<VariantSpecClarityResult>;
