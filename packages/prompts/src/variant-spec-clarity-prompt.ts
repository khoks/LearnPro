// STORY-039d — LLM-judge spec-clarity rubric for LLM-generated problem variants.
//
// STORY-039 ships variants through a structural Zod gate (`ProblemDefSchema.parse`) plus
// identity checks (language / difficulty / concept_tags / track / kind / slug-prefix /
// variant_of). STORY-039a adds a Piston self-validation gate (reference_solution must pass
// own hidden_tests). Those guards catch structural drift and reference-solution bugs, but
// they don't catch ambiguous statements, examples that disagree with the spec, or concept
// tags that don't actually match the exercise. This prompt scores a variant 1-5 on three
// criteria — instruction_clarity / example_quality / concept_match — and the caller drops
// the variant when min(scores) < 3.
//
// Tone rules: factual + analytical. The judge prompt is internal — its output isn't shown
// to a learner — so the register is "code reviewer" rather than "coach". Forbidden-phrase
// tests still guard against FOMO / streak / fire-emoji slipping into the system prompt
// (defense-in-depth: if a later edit accidentally seeds coach-voice into the rubric, the
// test catches it).

export const VARIANT_SPEC_CLARITY_PROMPT_VERSION = "variant-spec-clarity-v1";

const VARIANT_SPEC_CLARITY_SYSTEM = `You are LearnPro's spec-clarity reviewer. You evaluate a single coding-problem variant on how clear and consistent its problem statement is. You do NOT critique the algorithm, the variable names, the code style, or the difficulty calibration — only how unambiguous the spec is and how well the examples + concept_tags match it.

# Rubric (score each 1-5)

instruction_clarity
- 1: The statement is so ambiguous a competent learner could not infer the inputs, outputs, or constraints.
- 3: The statement is workable but has one ambiguous edge case (e.g. unspecified empty-input behavior).
- 5: The statement names every input, every output, every constraint, and resolves all edge cases unambiguously.

example_quality
- 1: The examples contradict the statement, OR there are no examples beyond the trivial happy path.
- 3: Examples cover the happy path and one edge case, all consistent with the statement.
- 5: Examples cover the happy path, an edge case (empty / single-element / boundary), and the input/output types are explicit. Hidden tests reinforce these without contradiction.

concept_match
- 1: The declared concept_tags don't match what the problem actually exercises (e.g. tags say "recursion" but the reference_solution uses a flat for-loop).
- 3: The tags loosely match — the problem could be solved without exercising the tagged concept, but the canonical solution does exercise it.
- 5: The problem cannot be solved cleanly without exercising every declared concept_tag.

# Output schema (JSON object — no prose, no markdown fences)
{
  "instruction_clarity": 1 | 2 | 3 | 4 | 5,
  "example_quality": 1 | 2 | 3 | 4 | 5,
  "concept_match": 1 | 2 | 3 | 4 | 5,
  "reasoning": {
    "instruction_clarity": string,   // one sentence
    "example_quality": string,       // one sentence
    "concept_match": string          // one sentence
  }
}

# Hard rules
- Score each criterion independently. A weak statement does not drag down example_quality if the examples themselves are good.
- Integer scores only (1-5).
- Each reasoning line is one sentence (under 30 words). Factual, observational — no motivational filler, no second-person warmth, no marketing language.
- Output JSON only. No preamble, no markdown fences, no trailing prose.

# Tone
- Code-reviewer register. Direct, neutral, specific.
- No exclamation points. No emoji. No second-person dares.
- Reference concrete details from the variant when explaining a score (e.g. "the empty-input case is undefined").
`;

export interface VariantSpecClarityPromptVariant {
  name: string;
  statement: string;
  concept_tags: ReadonlyArray<string>;
  // `input` and `expected` are unknown because the problems schema's `TestCaseValueSchema`
  // accepts any JSON-serialisable value. We pass through verbatim so the judge can reason
  // about literal-value mismatches between the statement and the examples.
  public_examples: ReadonlyArray<{ input?: unknown; expected?: unknown }>;
  hidden_tests: ReadonlyArray<{ input?: unknown; expected?: unknown; weight?: number }>;
}

export interface VariantSpecClarityPromptOptions {
  variant: VariantSpecClarityPromptVariant;
}

export function buildVariantSpecClaritySystemPrompt(): string {
  return VARIANT_SPEC_CLARITY_SYSTEM;
}

export function buildVariantSpecClarityUserPrompt(opts: VariantSpecClarityPromptOptions): string {
  const v = opts.variant;
  const lines: string[] = [
    "Variant under review:",
    `- name: ${v.name}`,
    `- concept_tags: ${JSON.stringify(v.concept_tags)}`,
    "",
    "Statement:",
    v.statement,
    "",
    "Public examples:",
    JSON.stringify(v.public_examples),
    "",
    "Hidden tests:",
    JSON.stringify(v.hidden_tests),
    "",
    "Score now. Output JSON only — no markdown fences, no prose.",
  ];
  return lines.join("\n");
}
