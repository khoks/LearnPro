import { ANTHROPIC_HAIKU, ANTHROPIC_OPUS } from "./models.js";

export const ANTHROPIC_SONNET = "claude-sonnet-4-6";

export interface ModelPrice {
  input_per_mtok: number;
  output_per_mtok: number;
}

export const PRICING_VERSION = "2026-04-26";

// USD per 1M tokens. Anchored to Anthropic public list prices snapshot at PRICING_VERSION.
// When prices change, bump PRICING_VERSION and append a new constant — never mutate in place.
// Rows for OpenAI / Ollama land when their providers do.
export const MODEL_PRICING: Record<string, ModelPrice> = {
  [ANTHROPIC_OPUS]: { input_per_mtok: 15, output_per_mtok: 75 },
  [ANTHROPIC_SONNET]: { input_per_mtok: 3, output_per_mtok: 15 },
  [ANTHROPIC_HAIKU]: { input_per_mtok: 1, output_per_mtok: 5 },
};

export interface CostInput {
  model: string;
  input_tokens: number;
  output_tokens: number;
}

export interface CostResult {
  cost_usd: number;
  pricing_version: string;
  known_model: boolean;
}

// Compute cost without throwing on unknown models — pricing-table drift should not break the
// runtime path. Unknown models record cost=0 and known_model=false; an analytics dashboard can
// flag this for the operator to update MODEL_PRICING.
export function costFor(input: CostInput): CostResult {
  const price = MODEL_PRICING[input.model];
  if (price === undefined) {
    return { cost_usd: 0, pricing_version: PRICING_VERSION, known_model: false };
  }
  const cost =
    (input.input_tokens * price.input_per_mtok + input.output_tokens * price.output_per_mtok) /
    1_000_000;
  return {
    cost_usd: round6(cost),
    pricing_version: PRICING_VERSION,
    known_model: true,
  };
}

function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}
