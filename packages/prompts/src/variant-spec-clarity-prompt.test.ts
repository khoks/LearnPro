import { describe, expect, it } from "vitest";
import {
  VARIANT_SPEC_CLARITY_PROMPT_VERSION,
  buildVariantSpecClaritySystemPrompt,
  buildVariantSpecClarityUserPrompt,
} from "./variant-spec-clarity-prompt.js";

// STORY-039d — coach-voice forbidden-phrase test on the system prompt. The judge is internal
// (its output is never shown to a learner) so the register is "code reviewer", but we still
// guard against FOMO / streak / fire-emoji slipping in via a later edit. The list mirrors
// the rest of the user-visible-copy enforcement across notifications + dashboard.
const FORBIDDEN_SUBSTRINGS = [
  "DON'T LOSE",
  "lose your streak",
  "fall behind",
  "DAY ",
  "🔥", // 🔥
  "⚠️", // ⚠️
  "leaderboard",
  "you've got this",
  "level up",
  "fomo",
  "crush it",
  "beat the clock",
];

describe("VARIANT_SPEC_CLARITY_PROMPT_VERSION — STORY-039d", () => {
  it("is versioned with the v1 tag", () => {
    expect(VARIANT_SPEC_CLARITY_PROMPT_VERSION).toBe("variant-spec-clarity-v1");
  });
});

describe("buildVariantSpecClaritySystemPrompt — STORY-039d", () => {
  it("names all three rubric criteria", () => {
    const sys = buildVariantSpecClaritySystemPrompt();
    expect(sys).toContain("instruction_clarity");
    expect(sys).toContain("example_quality");
    expect(sys).toContain("concept_match");
  });

  it("specifies a 1-5 integer scale per criterion", () => {
    const sys = buildVariantSpecClaritySystemPrompt();
    expect(sys).toMatch(/1-5/);
    expect(sys.toLowerCase()).toContain("integer scores only");
  });

  it("requires reasoning per criterion in the output schema", () => {
    const sys = buildVariantSpecClaritySystemPrompt();
    expect(sys).toContain('"reasoning"');
  });

  it("instructs the model to output JSON only (no fences, no prose)", () => {
    const sys = buildVariantSpecClaritySystemPrompt();
    expect(sys.toLowerCase()).toContain("no markdown fences");
    expect(sys.toLowerCase()).toContain("no prose");
  });

  it("anchors a code-reviewer register (factual, neutral)", () => {
    const sys = buildVariantSpecClaritySystemPrompt().toLowerCase();
    expect(sys).toContain("code-reviewer");
  });

  it("has no forbidden coach-voice phrases", () => {
    const sys = buildVariantSpecClaritySystemPrompt().toLowerCase();
    for (const phrase of FORBIDDEN_SUBSTRINGS) {
      expect(sys.includes(phrase.toLowerCase()), `system prompt contains "${phrase}"`).toBe(false);
    }
  });

  it("explicitly forbids motivational filler + emoji + exclamation in the output reasoning", () => {
    const sys = buildVariantSpecClaritySystemPrompt().toLowerCase();
    expect(sys).toContain("no motivational filler");
    expect(sys).toContain("no emoji");
    expect(sys).toContain("no exclamation");
  });

  it("rubric anchor scores explain what 1 / 3 / 5 mean per criterion", () => {
    const sys = buildVariantSpecClaritySystemPrompt();
    // Each criterion gets at least one bulleted anchor for 1 + 3 + 5.
    const criteria = ["instruction_clarity", "example_quality", "concept_match"];
    for (const c of criteria) {
      const section = sys.slice(sys.indexOf(c));
      expect(section, `criterion ${c} should have a 1-anchor`).toMatch(/-\s*1:/);
      expect(section, `criterion ${c} should have a 3-anchor`).toMatch(/-\s*3:/);
      expect(section, `criterion ${c} should have a 5-anchor`).toMatch(/-\s*5:/);
    }
  });
});

describe("buildVariantSpecClarityUserPrompt — STORY-039d", () => {
  function exampleVariant() {
    return {
      name: "Product of odd numbers",
      statement: "Given a list of integers, return the product of all odd numbers.",
      concept_tags: ["loops", "arithmetic"],
      public_examples: [{ input: [1, 2, 3, 4, 5], expected: 15 }],
      hidden_tests: [
        { input: [], expected: 1 },
        { input: [2, 4, 6], expected: 1 },
      ],
    };
  }

  it("renders the variant name + statement + concept_tags", () => {
    const out = buildVariantSpecClarityUserPrompt({ variant: exampleVariant() });
    expect(out).toContain("Product of odd numbers");
    expect(out).toContain("Given a list of integers");
    expect(out).toContain("loops");
    expect(out).toContain("arithmetic");
  });

  it("renders public examples + hidden tests verbatim as JSON", () => {
    const out = buildVariantSpecClarityUserPrompt({ variant: exampleVariant() });
    expect(out).toContain("Public examples:");
    expect(out).toContain("Hidden tests:");
    // The hidden tests array shape should round-trip through JSON.stringify.
    expect(out).toContain('"input":[]');
    expect(out).toContain('"expected":1');
  });

  it("instructs the model to output JSON only with no markdown fences", () => {
    const out = buildVariantSpecClarityUserPrompt({ variant: exampleVariant() });
    expect(out.toLowerCase()).toContain("no markdown fences");
  });
});
