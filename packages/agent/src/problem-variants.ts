// STORY-039 — LLM-generated problem variants on top of the curated seed bank.
//
// `generateProblemVariant` is a pure function: given an LLMProvider and a source ProblemDef,
// it asks Haiku for a variant, parses the JSON output, validates against `ProblemDefSchema`,
// and returns the parsed list. Failed parses (invalid JSON, schema-failing variants) are
// dropped — the agent retries once and then returns whatever passed validation, which may
// be empty.
//
// Design intent (per STORY-039):
//   - Cheap: Haiku, capped output tokens, single retry.
//   - Pure: doesn't talk to the DB or sandbox. The route handler owns persistence and the
//     optional Piston self-validation step (gated by LEARNPRO_REQUIRE_PISTON).
//   - Strict at the boundary: the LLM output is run through `ProblemDefSchema.parse` so a
//     row that lands in the `problem_variants` cache is interchangeable with a YAML.
//   - Best-effort: the function never throws on a bad LLM response. The route returns 200
//     with `variants: []` and the UI surfaces an empty state.

import type { LLMProvider } from "@learnpro/llm";
import { ANTHROPIC_HAIKU } from "@learnpro/llm";
import {
  ProblemDefSchema,
  isImplementProblem,
  type ImplementProblemDef,
  type ProblemDef,
} from "@learnpro/problems";
import {
  PROBLEM_VARIANTS_PROMPT_VERSION,
  buildProblemVariantsSystemPrompt,
  buildProblemVariantsUserPrompt,
  type ProblemVariantsPromptSourceShape,
} from "@learnpro/prompts";

export interface GenerateProblemVariantInput {
  llm: LLMProvider;
  user_id: string;
  source: ImplementProblemDef;
  // Number of variants to generate. v1 only supports 1; the field is here so the route
  // and agent can grow to N without a breaking change.
  count?: number;
  // Override the default Haiku model — used by tests + future operator tuning.
  model?: string;
}

export interface GenerateProblemVariantOutput {
  variants: ProblemDef[];
  // True when the agent fell back to an empty list because every attempt failed Zod
  // validation. The route surfaces this so the UI can show a warm "couldn't produce a
  // variant — try again later" empty state.
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
}

async function tryGenerateOne(input: TryGenerateOneInput): Promise<ProblemDef | null> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const variant_index = input.variant_index + attempt;
    const variant = await callOnce({
      llm: input.llm,
      user_id: input.user_id,
      source: input.source,
      variant_index,
      ...(input.model !== undefined ? { model: input.model } : {}),
    });
    if (variant && !input.already_used_slugs.has(variant.slug)) {
      return variant;
    }
  }
  return null;
}

interface CallOnceInput {
  llm: LLMProvider;
  user_id: string;
  source: ImplementProblemDef;
  variant_index: number;
  model?: string;
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

  const res = await input.llm.complete({
    messages: [{ role: "user", content: user }],
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
