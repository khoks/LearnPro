import type { ProblemDef } from "@learnpro/problems";
import { describe, expect, it, vi } from "vitest";
import type { GiveHintDeps, HintEpisodeContext } from "../ports.js";
import { createGiveHintTool, EpisodeNotFoundError, xpCostForRung } from "./give-hint.js";

const EPISODE_ID = "11111111-1111-4111-8111-111111111111";

function pdef(): ProblemDef {
  return {
    slug: "binary-search",
    name: "Binary search",
    language: "python",
    difficulty: 3,
    track: "python-fundamentals",
    concept_tags: ["algorithms"],
    statement: "find target in nums",
    starter_code: "def solve(nums, target):\n    pass\n",
    reference_solution: "def solve(nums, target):\n    return -1\n",
    public_examples: [{ input: [[1, 3, 5], 3], expected: 1 }],
    hidden_tests: [{ input: [[1, 3, 5], 4], expected: -1 }],
    expected_median_time_to_solve_ms: 300_000,
  };
}

function fakeDeps(opts: {
  ctx?: HintEpisodeContext | null;
  hint?: string;
}): GiveHintDeps & { generateHintMock: ReturnType<typeof vi.fn>; bumpedCount: number } {
  const generateHintMock = vi.fn(async () => ({ hint: opts.hint ?? "stub hint" }));
  let bumpedCount = 0;
  return {
    generateHintMock,
    get bumpedCount() {
      return bumpedCount;
    },
    async loadEpisodeProblem() {
      return opts.ctx === undefined
        ? {
            episode_id: EPISODE_ID,
            user_id: "user-1",
            problem_id: "problem-1",
            problem: pdef(),
            prior_hints: [],
          }
        : opts.ctx;
    },
    generateHint: generateHintMock,
    async incrementHintsUsed() {
      bumpedCount += 1;
    },
  };
}

describe("xpCostForRung", () => {
  it("rung 1 = 5, rung 2 = 15, rung 3 = 30", () => {
    expect(xpCostForRung(1)).toBe(5);
    expect(xpCostForRung(2)).toBe(15);
    expect(xpCostForRung(3)).toBe(30);
  });
});

describe("createGiveHintTool", () => {
  it("validates input via Zod (rejects rung 0)", async () => {
    const deps = fakeDeps({});
    const tool = createGiveHintTool({ deps });
    await expect(tool.run({ episode_id: EPISODE_ID, rung: 0 as never })).rejects.toThrow();
  });

  it("validates input via Zod (rejects non-uuid)", async () => {
    const deps = fakeDeps({});
    const tool = createGiveHintTool({ deps });
    await expect(tool.run({ episode_id: "nope", rung: 1 })).rejects.toThrow();
  });

  it("returns the LLM hint with the right rung + xp_cost", async () => {
    const deps = fakeDeps({ hint: "Have you considered the midpoint as the pivot?" });
    const tool = createGiveHintTool({ deps });
    const out = await tool.run({ episode_id: EPISODE_ID, rung: 1 });
    expect(out.rung).toBe(1);
    expect(out.hint).toBe("Have you considered the midpoint as the pivot?");
    expect(out.xp_cost).toBe(5);
    expect(deps.bumpedCount).toBe(1);
  });

  it("throws EpisodeNotFoundError when the deps return null", async () => {
    const deps = fakeDeps({ ctx: null });
    const tool = createGiveHintTool({ deps });
    await expect(tool.run({ episode_id: EPISODE_ID, rung: 2 })).rejects.toBeInstanceOf(
      EpisodeNotFoundError,
    );
  });

  it("passes prior hints through to the generator (so rung 2 sees rung 1, etc.)", async () => {
    const ctx: HintEpisodeContext = {
      episode_id: EPISODE_ID,
      user_id: "user-1",
      problem_id: "problem-1",
      problem: pdef(),
      prior_hints: [{ rung: 1, hint: "rung-1 hint", xp_cost: 5 }],
    };
    const deps = fakeDeps({ ctx, hint: "rung-2 hint" });
    const tool = createGiveHintTool({ deps });
    await tool.run({ episode_id: EPISODE_ID, rung: 2 });
    expect(deps.generateHintMock).toHaveBeenCalledTimes(1);
    const args = deps.generateHintMock.mock.calls[0]?.[0];
    expect(args?.rung).toBe(2);
    expect(args?.prior_hints).toHaveLength(1);
    expect(args?.prior_hints[0].rung).toBe(1);
  });
});
