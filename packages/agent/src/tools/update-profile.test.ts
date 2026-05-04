import type { ProblemDef } from "@learnpro/problems";
import type { ConceptSkill } from "@learnpro/scoring";
import { describe, expect, it, vi } from "vitest";
import type {
  AwardXpForEpisodeInput,
  AwardXpForEpisodeResult,
  UpdateProfileDeps,
  UpdateProfileEpisodeContext,
} from "../ports.js";
import {
  coldStartSkill,
  createUpdateProfileTool,
  deriveFinalOutcome,
  UpdateProfileEpisodeMissingError,
} from "./update-profile.js";

const EPISODE_ID = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "self";

function pdef(overrides: Partial<ProblemDef> = {}): ProblemDef {
  return {
    slug: "two-sum",
    name: "Two sum",
    language: "python",
    difficulty: 2,
    track: "python-fundamentals",
    concept_tags: ["arrays", "hash-map", "missing-tag"],
    statement: "find indices",
    starter_code: "def solve(nums, target):\n    pass\n",
    reference_solution: "def solve(nums, target):\n    return [0, 1]\n",
    public_examples: [{ input: [[2, 7], 9], expected: [0, 1] }],
    hidden_tests: [{ input: [[2, 7], 9], expected: [0, 1] }],
    expected_median_time_to_solve_ms: 60_000,
    ...overrides,
  };
}

function fakeDeps(opts: {
  ctx?: UpdateProfileEpisodeContext | null;
  resolved?: Map<string, string>;
  prior_skill?: ConceptSkill | null;
  // Allow tests to force a specific awardXp result (e.g. simulate idempotent re-run by returning
  // inserted: false). Defaults to "first-time award".
  awardXpResult?: (input: AwardXpForEpisodeInput) => AwardXpForEpisodeResult;
}): UpdateProfileDeps & {
  closed: number;
  upserts: Array<{ concept_id: string; skill: ConceptSkill }>;
  xpCalls: AwardXpForEpisodeInput[];
  closeMock: ReturnType<typeof vi.fn>;
} {
  let closed = 0;
  const upserts: Array<{ concept_id: string; skill: ConceptSkill }> = [];
  const xpCalls: AwardXpForEpisodeInput[] = [];
  const closeMock = vi.fn(async () => {
    closed += 1;
  });
  return {
    closeMock,
    get closed() {
      return closed;
    },
    get upserts() {
      return upserts;
    },
    get xpCalls() {
      return xpCalls;
    },
    async loadEpisodeForClose() {
      return opts.ctx === undefined
        ? {
            episode_id: EPISODE_ID,
            user_id: "user-1",
            org_id: ORG_ID,
            problem: pdef(),
            hints_used: 0,
            attempts: 0,
            started_at: 1700000000000,
          }
        : opts.ctx;
    },
    closeEpisode: closeMock,
    async resolveConceptIds() {
      return (
        opts.resolved ??
        new Map([
          ["arrays", "concept-arrays"],
          ["hash-map", "concept-hash-map"],
        ])
      );
    },
    async loadSkillScore({ concept_id }) {
      if (opts.prior_skill === null) return null;
      return opts.prior_skill ?? coldStartSkill(concept_id);
    },
    async upsertSkillScore({ concept_id, skill }) {
      upserts.push({ concept_id, skill });
    },
    async awardXp(input) {
      xpCalls.push(input);
      return opts.awardXpResult
        ? opts.awardXpResult(input)
        : { inserted: true, amount: input.amount };
    },
  };
}

describe("deriveFinalOutcome", () => {
  it("abandoned beats everything", () => {
    expect(
      deriveFinalOutcome({ abandoned: true, passed: true, hints_used: 0, reveal_clicked: false }),
    ).toBe("abandoned");
  });

  it("revealed beats passed", () => {
    expect(
      deriveFinalOutcome({ abandoned: false, passed: true, hints_used: 0, reveal_clicked: true }),
    ).toBe("revealed");
  });

  it("failed when not passed", () => {
    expect(
      deriveFinalOutcome({ abandoned: false, passed: false, hints_used: 0, reveal_clicked: false }),
    ).toBe("failed");
  });

  it("passed_with_hints when hints_used > 0", () => {
    expect(
      deriveFinalOutcome({ abandoned: false, passed: true, hints_used: 2, reveal_clicked: false }),
    ).toBe("passed_with_hints");
  });

  it("clean pass when no hints used", () => {
    expect(
      deriveFinalOutcome({ abandoned: false, passed: true, hints_used: 0, reveal_clicked: false }),
    ).toBe("passed");
  });
});

describe("createUpdateProfileTool", () => {
  it("validates input via Zod (rejects non-uuid)", async () => {
    const deps = fakeDeps({});
    const tool = createUpdateProfileTool({ deps });
    await expect(
      tool.run({
        episode_id: "not-a-uuid",
        outcome: "passed",
        passed: true,
        submit_count: 1,
        hints_used: 0,
        finished_at_ms: 1700000060000,
      }),
    ).rejects.toThrow();
  });

  it("happy path: closes the episode + upserts one skill_score per resolved concept tag", async () => {
    const deps = fakeDeps({});
    const tool = createUpdateProfileTool({ deps });
    const out = await tool.run({
      episode_id: EPISODE_ID,
      outcome: "passed",
      passed: true,
      submit_count: 1,
      hints_used: 0,
      finished_at_ms: 1700000060000,
    });
    expect(deps.closed).toBe(1);
    expect(deps.upserts).toHaveLength(2); // missing-tag is filtered out
    expect(out.skill_updates.map((s) => s.concept_slug).sort()).toEqual(["arrays", "hash-map"]);
    expect(out.time_to_solve_ms).toBe(60_000);
  });

  it("a clean pass increments skill score upward from cold-start (skill 0.5)", async () => {
    const deps = fakeDeps({});
    const tool = createUpdateProfileTool({ deps });
    const out = await tool.run({
      episode_id: EPISODE_ID,
      outcome: "passed",
      passed: true,
      submit_count: 1,
      hints_used: 0,
      finished_at_ms: 1700000020000,
    });
    for (const u of out.skill_updates) {
      expect(u.next_skill).toBeGreaterThan(u.prev_skill);
      expect(u.attempts).toBe(1);
    }
  });

  it("a failed solve does not bump skill upward", async () => {
    const deps = fakeDeps({});
    const tool = createUpdateProfileTool({ deps });
    const out = await tool.run({
      episode_id: EPISODE_ID,
      outcome: "failed",
      passed: false,
      submit_count: 3,
      hints_used: 1,
      finished_at_ms: 1700000180000,
    });
    for (const u of out.skill_updates) {
      expect(u.next_skill).toBeLessThanOrEqual(u.prev_skill);
    }
  });

  it("throws UpdateProfileEpisodeMissingError when episode missing", async () => {
    const deps = fakeDeps({ ctx: null });
    const tool = createUpdateProfileTool({ deps });
    await expect(
      tool.run({
        episode_id: EPISODE_ID,
        outcome: "passed",
        passed: true,
        submit_count: 1,
        hints_used: 0,
        finished_at_ms: 1700000060000,
      }),
    ).rejects.toBeInstanceOf(UpdateProfileEpisodeMissingError);
  });

  it("silently skips concept_tags not present in the DB resolver map", async () => {
    const deps = fakeDeps({ resolved: new Map([["arrays", "concept-arrays"]]) });
    const tool = createUpdateProfileTool({ deps });
    const out = await tool.run({
      episode_id: EPISODE_ID,
      outcome: "passed",
      passed: true,
      submit_count: 1,
      hints_used: 0,
      finished_at_ms: 1700000060000,
    });
    expect(out.skill_updates).toHaveLength(1);
    expect(out.skill_updates[0]?.concept_slug).toBe("arrays");
  });
});

describe("createUpdateProfileTool: XP awarding (STORY-022)", () => {
  it("awards XP for a clean pass and surfaces it in the output", async () => {
    const deps = fakeDeps({});
    const tool = createUpdateProfileTool({ deps });
    const out = await tool.run({
      episode_id: EPISODE_ID,
      outcome: "passed",
      passed: true,
      submit_count: 1,
      hints_used: 0,
      finished_at_ms: 1700000060000,
    });
    // difficulty 2 default → base 10 × 1.5 × 1.0 = 15. No hints, no rung cost.
    expect(out.xp_award).toEqual({ amount: 15, reason: "episode-passed", awarded: true });
    expect(deps.xpCalls).toHaveLength(1);
    expect(deps.xpCalls[0]?.episode_id).toBe(EPISODE_ID);
    expect(deps.xpCalls[0]?.user_id).toBe("user-1");
  });

  it("awards reduced XP for a passed_with_hints outcome", async () => {
    const deps = fakeDeps({});
    const tool = createUpdateProfileTool({ deps });
    const out = await tool.run({
      episode_id: EPISODE_ID,
      outcome: "passed_with_hints",
      passed: true,
      submit_count: 1,
      hints_used: 1,
      finished_at_ms: 1700000060000,
    });
    // difficulty 2 → 10 × 1.5 × 0.7 = 10.5; minus rung-1 cost 5 = 5.5; floored = 5.
    expect(out.xp_award).toEqual({ amount: 5, reason: "episode-passed-with-hints", awarded: true });
  });

  it("awards 0 XP for a failed episode but still records the reason row", async () => {
    const deps = fakeDeps({});
    const tool = createUpdateProfileTool({ deps });
    const out = await tool.run({
      episode_id: EPISODE_ID,
      outcome: "failed",
      passed: false,
      submit_count: 3,
      hints_used: 1,
      finished_at_ms: 1700000180000,
    });
    expect(out.xp_award).toEqual({ amount: 0, reason: "episode-failed", awarded: true });
  });

  it("awards 0 XP for a revealed outcome (correctness multiplier 0)", async () => {
    const deps = fakeDeps({});
    const tool = createUpdateProfileTool({ deps });
    const out = await tool.run({
      episode_id: EPISODE_ID,
      outcome: "revealed",
      passed: true,
      reveal_clicked: true,
      submit_count: 1,
      hints_used: 0,
      finished_at_ms: 1700000060000,
    });
    expect(out.xp_award).toEqual({ amount: 0, reason: "episode-revealed", awarded: true });
  });

  it("awards 0 XP for an abandoned outcome", async () => {
    const deps = fakeDeps({});
    const tool = createUpdateProfileTool({ deps });
    const out = await tool.run({
      episode_id: EPISODE_ID,
      outcome: "abandoned",
      passed: false,
      submit_count: 1,
      hints_used: 0,
      finished_at_ms: 1700000060000,
    });
    expect(out.xp_award).toEqual({ amount: 0, reason: "episode-abandoned", awarded: true });
  });

  it("scales XP with problem difficulty (level 5 = 4.5x base)", async () => {
    const deps = fakeDeps({
      ctx: {
        episode_id: EPISODE_ID,
        user_id: "user-1",
        org_id: ORG_ID,
        problem: pdef({ difficulty: 5 }),
        hints_used: 0,
        attempts: 0,
        started_at: 1700000000000,
      },
    });
    const tool = createUpdateProfileTool({ deps });
    const out = await tool.run({
      episode_id: EPISODE_ID,
      outcome: "passed",
      passed: true,
      submit_count: 1,
      hints_used: 0,
      finished_at_ms: 1700000060000,
    });
    expect(out.xp_award.amount).toBe(45); // 10 × 4.5 × 1.0 = 45
  });

  it("reports awarded=false when the dep returns inserted=false (idempotent re-run)", async () => {
    const deps = fakeDeps({
      awardXpResult: () => ({ inserted: false, amount: 0 }),
    });
    const tool = createUpdateProfileTool({ deps });
    const out = await tool.run({
      episode_id: EPISODE_ID,
      outcome: "passed",
      passed: true,
      submit_count: 1,
      hints_used: 0,
      finished_at_ms: 1700000060000,
    });
    expect(out.xp_award.awarded).toBe(false);
    // The intended grant is still surfaced in `amount` so the caller can show "would have been
    // 15 XP — already credited".
    expect(out.xp_award.amount).toBe(15);
  });
});
