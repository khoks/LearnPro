import { describe, expect, it } from "vitest";
import { ANTHROPIC_HAIKU, ANTHROPIC_OPUS } from "./models.js";
import { ANTHROPIC_SONNET, costFor, MODEL_PRICING, PRICING_VERSION } from "./pricing.js";

describe("costFor", () => {
  it("computes Opus cost: 1M input + 1M output → $15 + $75 = $90", () => {
    const r = costFor({
      model: ANTHROPIC_OPUS,
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
    });
    expect(r.cost_usd).toBe(90);
    expect(r.known_model).toBe(true);
    expect(r.pricing_version).toBe(PRICING_VERSION);
  });

  it("computes Haiku cost: 1k input + 1k output → $0.000001 * (1k + 5k)", () => {
    const r = costFor({
      model: ANTHROPIC_HAIKU,
      input_tokens: 1_000,
      output_tokens: 1_000,
    });
    // (1000 * 1 + 1000 * 5) / 1_000_000 = 0.006
    expect(r.cost_usd).toBe(0.006);
    expect(r.known_model).toBe(true);
  });

  it("computes Sonnet cost (rounded to 6 decimals)", () => {
    const r = costFor({ model: ANTHROPIC_SONNET, input_tokens: 500, output_tokens: 250 });
    // (500 * 3 + 250 * 15) / 1M = 0.00525
    expect(r.cost_usd).toBe(0.00525);
  });

  it("returns cost=0 + known_model=false for unknown models, never throws", () => {
    const r = costFor({ model: "made-up-model", input_tokens: 100, output_tokens: 100 });
    expect(r.cost_usd).toBe(0);
    expect(r.known_model).toBe(false);
    expect(r.pricing_version).toBe(PRICING_VERSION);
  });

  it("stamps every result with the same PRICING_VERSION constant", () => {
    expect(
      costFor({ model: ANTHROPIC_OPUS, input_tokens: 0, output_tokens: 0 }).pricing_version,
    ).toBe(PRICING_VERSION);
  });

  it("includes Opus, Sonnet, and Haiku in the pricing table", () => {
    expect(MODEL_PRICING[ANTHROPIC_OPUS]).toBeDefined();
    expect(MODEL_PRICING[ANTHROPIC_SONNET]).toBeDefined();
    expect(MODEL_PRICING[ANTHROPIC_HAIKU]).toBeDefined();
  });
});
