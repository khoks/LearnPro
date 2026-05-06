// STORY-034 — A/B comparison between the legacy unified-tutor 0-1 rubric and the new split-grader
// 1-5 rubric. This test is INTENTIONALLY deterministic (no live LLM calls) — it parses the canned
// `grade-split-vs-unified.json` fixtures (which represent what each grader returned for the same
// 10 submissions) and asserts:
//
//   1. Every split-grader rubric in the fixture validates against GraderRubricSchema.
//   2. parseGraderResponse round-trips a stringified split rubric back to the same structure.
//   3. The split-grader's idiomatic dimension shows MORE variance than the unified rubric's
//      idiomatic dimension over the same submissions — the headline AC #6 claim that the split
//      gives more discriminating idiomatic scores.
//   4. The split-grader bonus distribution is non-degenerate (high-rubric solves get a positive
//      bonus, low-rubric solves get a negative one, and the per-bonus magnitudes stay clamped).
//
// Live A/B over real LLM transcripts (the headline STORY-034 AC #6) is documented as a follow-up
// in the Story's activity log — see the activity log entry on the Story file.

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  GRADER_BONUS_CLAMP,
  GraderRubricSchema,
  applyGraderBonus,
  parseGraderResponse,
} from "../src/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(HERE, "cases", "grade-split-vs-unified.json");

interface UnifiedRubric {
  correctness: number;
  idiomatic: number;
  edge_case_coverage: number;
}

interface SplitRubric {
  idiomatic: 1 | 2 | 3 | 4 | 5;
  efficiency: 1 | 2 | 3 | 4 | 5;
  test_coverage_thinking: 1 | 2 | 3 | 4 | 5;
}

interface ABSample {
  label: string;
  submission_summary: string;
  unified: { rubric: UnifiedRubric; prose_explanation: string };
  split: { pass: boolean; rubric: SplitRubric; reasoning: string };
}

interface ABFixture {
  id: string;
  story: string;
  description: string;
  samples: ABSample[];
}

async function loadFixture(): Promise<ABFixture> {
  const raw = await readFile(FIXTURE_PATH, "utf8");
  return JSON.parse(raw) as ABFixture;
}

function variance(samples: ReadonlyArray<number>): number {
  if (samples.length === 0) return 0;
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  const sumSq = samples.reduce((a, b) => a + (b - mean) ** 2, 0);
  return sumSq / samples.length;
}

function normalize0to1(samples: ReadonlyArray<number>): number[] {
  // Project the unified [0,1] and split [1,5] onto the same scale so the variance comparison is
  // apples-to-apples. (Variance compares spread, but the scales differ — projecting collapses
  // that confound.)
  const min = Math.min(...samples);
  const max = Math.max(...samples);
  if (max === min) return samples.map(() => 0.5);
  return samples.map((v) => (v - min) / (max - min));
}

describe("STORY-034 A/B: split grader rubric is more discriminating than unified", () => {
  it("the fixture has at least 10 samples", async () => {
    const fix = await loadFixture();
    expect(fix.samples.length).toBeGreaterThanOrEqual(10);
  });

  it("every split-grader rubric in the fixture validates against GraderRubricSchema", async () => {
    const fix = await loadFixture();
    for (const s of fix.samples) {
      expect(() => GraderRubricSchema.parse(s.split.rubric)).not.toThrow();
    }
  });

  it("parseGraderResponse round-trips every fixture's split rubric", async () => {
    const fix = await loadFixture();
    for (const s of fix.samples) {
      const text = JSON.stringify({
        pass: s.split.pass,
        rubric: s.split.rubric,
        reasoning: s.split.reasoning,
      });
      const parsed = parseGraderResponse(text);
      expect(parsed).not.toBeNull();
      expect(parsed?.rubric).toEqual(s.split.rubric);
      expect(parsed?.pass).toBe(s.split.pass);
    }
  });

  it("split-grader idiomatic variance ≥ unified idiomatic variance (on a normalized scale)", async () => {
    const fix = await loadFixture();
    const unifiedIdiomatic = fix.samples.map((s) => s.unified.rubric.idiomatic);
    const splitIdiomatic = fix.samples.map((s) => s.split.rubric.idiomatic);
    const unifiedVar = variance(normalize0to1(unifiedIdiomatic));
    const splitVar = variance(normalize0to1(splitIdiomatic));
    // Headline AC #6 — the split rubric uses more of its dynamic range than the unified one
    // because integer 1-5 forces the grader off the "everyone gets 0.7-0.9" attractor.
    expect(splitVar).toBeGreaterThanOrEqual(unifiedVar);
  });

  it("split-grader idiomatic distribution spans at least 4 of the 5 buckets", async () => {
    const fix = await loadFixture();
    const buckets = new Set(fix.samples.map((s) => s.split.rubric.idiomatic));
    expect(buckets.size).toBeGreaterThanOrEqual(4);
  });

  it("applyGraderBonus produces both positive and negative deltas across the sample set", async () => {
    const fix = await loadFixture();
    const passingSamples = fix.samples.filter((s) => s.split.pass);
    expect(passingSamples.length).toBeGreaterThan(0);
    const bonuses = passingSamples.map((s) =>
      applyGraderBonus({
        rubric: {
          pass: s.split.pass,
          rubric: s.split.rubric,
          reasoning: s.split.reasoning,
          fallback_used: false,
        },
        passed: s.split.pass,
      }),
    );
    const positives = bonuses.filter((b) => b > 0);
    const negatives = bonuses.filter((b) => b < 0);
    expect(positives.length).toBeGreaterThan(0);
    expect(negatives.length).toBeGreaterThan(0);
    for (const b of bonuses) {
      expect(Math.abs(b)).toBeLessThanOrEqual(GRADER_BONUS_CLAMP);
    }
  });

  it("non-degenerate: the rubric is not all-3 across samples (would defeat the bonus)", async () => {
    const fix = await loadFixture();
    const allThrees = fix.samples.every(
      (s) =>
        s.split.rubric.idiomatic === 3 &&
        s.split.rubric.efficiency === 3 &&
        s.split.rubric.test_coverage_thinking === 3,
    );
    expect(allThrees).toBe(false);
  });
});
