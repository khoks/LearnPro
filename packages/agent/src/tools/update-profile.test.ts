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

interface FakeDepsOpts {
  ctx?: UpdateProfileEpisodeContext | null;
  resolved?: Map<string, string>;
  prior_skill?: ConceptSkill | null;
  // Allow tests to force a specific awardXp result (e.g. simulate idempotent re-run by returning
  // inserted: false). Defaults to "first-time award".
  awardXpResult?: (input: AwardXpForEpisodeInput) => AwardXpForEpisodeResult;
  // STORY-015 — when provided, the tool calls markPlanItemCompleted on close. The fake records
  // every call so tests can assert idempotency. The result governs the boolean returned to the
  // caller; default is "marked, first time".
  markPlanResult?: (input: { user_id: string; problem_slug: string; episode_id: string }) => {
    updated: boolean;
  };
  // When true, the tool's call to markPlanItemCompleted will throw — tests assert the close
  // still completes (auto-mark is best-effort).
  markPlanThrows?: boolean;
  // STORY-054 — when true, wire `refreshConfidenceSignal` into the deps. When `wireSignalThrows`
  // is also set, the dep throws — tests assert the close still completes.
  wireSignal?: boolean;
  wireSignalThrows?: boolean;
  // STORY-031 — when true, wire the spaced-repetition deps. `priorCardState` lets a test seed an
  // existing FSRS state (default cold-start). `recordReviewThrows` makes recordConceptReview
  // raise — used to assert best-effort swallow. `dueCount` is what `countDueConcepts` returns.
  wireFsrs?: boolean;
  recordReviewThrows?: boolean;
  priorCardState?: import("@learnpro/scoring").FsrsCardState | null;
  dueCount?: number;
}

interface MarkPlanCall {
  user_id: string;
  problem_slug: string;
  episode_id: string;
}

interface RefreshSignalCall {
  user_id: string;
  org_id: string;
  episode_id: string;
  final_outcome: string;
  time_to_solve_ms: number;
  expected_time_ms: number;
}

interface RecordReviewCall {
  user_id: string;
  org_id: string;
  concept_id: string;
  next_state: import("@learnpro/scoring").FsrsCardState;
}

function fakeDeps(opts: FakeDepsOpts): UpdateProfileDeps & {
  closed: number;
  upserts: Array<{ concept_id: string; skill: ConceptSkill }>;
  xpCalls: AwardXpForEpisodeInput[];
  closeMock: ReturnType<typeof vi.fn>;
  markPlanCalls: MarkPlanCall[];
  refreshSignalCalls: RefreshSignalCall[];
  reviewCalls: RecordReviewCall[];
  loadStateCalls: number;
} {
  let closed = 0;
  const upserts: Array<{ concept_id: string; skill: ConceptSkill }> = [];
  const xpCalls: AwardXpForEpisodeInput[] = [];
  const markPlanCalls: MarkPlanCall[] = [];
  const refreshSignalCalls: RefreshSignalCall[] = [];
  const reviewCalls: RecordReviewCall[] = [];
  let loadStateCalls = 0;
  const closeMock = vi.fn(async () => {
    closed += 1;
  });
  const wirePlan = opts.markPlanResult !== undefined || opts.markPlanThrows === true;
  const wireSignal = opts.wireSignal === true || opts.wireSignalThrows === true;
  const wireFsrs = opts.wireFsrs === true || opts.recordReviewThrows === true;
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
    get markPlanCalls() {
      return markPlanCalls;
    },
    get refreshSignalCalls() {
      return refreshSignalCalls;
    },
    get reviewCalls() {
      return reviewCalls;
    },
    get loadStateCalls() {
      return loadStateCalls;
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
    ...(wirePlan && {
      markPlanItemCompleted: async (input: MarkPlanCall) => {
        markPlanCalls.push(input);
        if (opts.markPlanThrows) {
          throw new Error("simulated plan markCompleted outage");
        }
        return opts.markPlanResult ? opts.markPlanResult(input) : { updated: true };
      },
    }),
    ...(wireSignal && {
      refreshConfidenceSignal: async (input: RefreshSignalCall) => {
        refreshSignalCalls.push(input);
        if (opts.wireSignalThrows) {
          throw new Error("simulated confidence_signal outage");
        }
      },
    }),
    ...(wireFsrs && {
      loadConceptCardState: async () => {
        loadStateCalls += 1;
        return opts.priorCardState ?? null;
      },
      recordConceptReview: async (input: RecordReviewCall) => {
        if (opts.recordReviewThrows) {
          throw new Error("simulated FSRS write outage");
        }
        reviewCalls.push(input);
      },
      countDueConcepts: async () => opts.dueCount ?? 0,
    }),
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

describe("createUpdateProfileTool: plan item auto-mark (STORY-015)", () => {
  it("calls markPlanItemCompleted with the problem slug + episode_id when wired", async () => {
    const deps = fakeDeps({ markPlanResult: () => ({ updated: true }) });
    const tool = createUpdateProfileTool({ deps });
    const out = await tool.run({
      episode_id: EPISODE_ID,
      outcome: "passed",
      passed: true,
      submit_count: 1,
      hints_used: 0,
      finished_at_ms: 1700000060000,
    });
    expect(out.plan_item_marked).toBe(true);
    expect(deps.markPlanCalls).toHaveLength(1);
    expect(deps.markPlanCalls[0]).toEqual({
      user_id: "user-1",
      problem_slug: "two-sum",
      episode_id: EPISODE_ID,
    });
  });

  it("plan_item_marked=false when no plan item matches (dep returns updated=false)", async () => {
    const deps = fakeDeps({ markPlanResult: () => ({ updated: false }) });
    const tool = createUpdateProfileTool({ deps });
    const out = await tool.run({
      episode_id: EPISODE_ID,
      outcome: "passed",
      passed: true,
      submit_count: 1,
      hints_used: 0,
      finished_at_ms: 1700000060000,
    });
    expect(out.plan_item_marked).toBe(false);
    expect(deps.markPlanCalls).toHaveLength(1);
  });

  it("idempotency: re-grading the same episode (markPlan returns updated=false) → plan_item_marked=false", async () => {
    let calls = 0;
    const deps = fakeDeps({
      markPlanResult: () => {
        calls += 1;
        return { updated: calls === 1 };
      },
    });
    const tool = createUpdateProfileTool({ deps });
    const first = await tool.run({
      episode_id: EPISODE_ID,
      outcome: "passed",
      passed: true,
      submit_count: 1,
      hints_used: 0,
      finished_at_ms: 1700000060000,
    });
    const second = await tool.run({
      episode_id: EPISODE_ID,
      outcome: "passed",
      passed: true,
      submit_count: 1,
      hints_used: 0,
      finished_at_ms: 1700000060000,
    });
    expect(first.plan_item_marked).toBe(true);
    expect(second.plan_item_marked).toBe(false);
    expect(deps.markPlanCalls).toHaveLength(2);
  });

  it("plan_item_marked=false when the planner isn't wired (no markPlanItemCompleted dep)", async () => {
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
    expect(out.plan_item_marked).toBe(false);
    expect(deps.markPlanCalls).toEqual([]);
  });

  it("auto-mark failure is swallowed: close still succeeds, plan_item_marked=false", async () => {
    const deps = fakeDeps({ markPlanThrows: true });
    const tool = createUpdateProfileTool({ deps });
    const out = await tool.run({
      episode_id: EPISODE_ID,
      outcome: "passed",
      passed: true,
      submit_count: 1,
      hints_used: 0,
      finished_at_ms: 1700000060000,
    });
    expect(out.plan_item_marked).toBe(false);
    // The close itself still completed.
    expect(deps.closed).toBe(1);
    expect(out.xp_award.awarded).toBe(true);
  });
});

describe("createUpdateProfileTool: confidence signal refresh (STORY-054)", () => {
  it("calls refreshConfidenceSignal with the close inputs when wired", async () => {
    const deps = fakeDeps({ wireSignal: true });
    const tool = createUpdateProfileTool({ deps });
    await tool.run({
      episode_id: EPISODE_ID,
      outcome: "passed",
      passed: true,
      submit_count: 1,
      hints_used: 0,
      finished_at_ms: 1700000060000,
    });
    expect(deps.refreshSignalCalls).toHaveLength(1);
    expect(deps.refreshSignalCalls[0]).toEqual({
      user_id: "user-1",
      org_id: ORG_ID,
      episode_id: EPISODE_ID,
      final_outcome: "passed",
      time_to_solve_ms: 60_000,
      expected_time_ms: 60_000,
    });
  });

  it("idempotency: re-grading the same episode invokes the dep again (signal absorbs drift)", async () => {
    const deps = fakeDeps({ wireSignal: true });
    const tool = createUpdateProfileTool({ deps });
    await tool.run({
      episode_id: EPISODE_ID,
      outcome: "passed",
      passed: true,
      submit_count: 1,
      hints_used: 0,
      finished_at_ms: 1700000060000,
    });
    await tool.run({
      episode_id: EPISODE_ID,
      outcome: "passed",
      passed: true,
      submit_count: 1,
      hints_used: 0,
      finished_at_ms: 1700000060000,
    });
    // Two calls land — the dep is responsible for being idempotent if the signal must dedupe.
    // EWMA absorbs the small drift since alpha is small.
    expect(deps.refreshSignalCalls).toHaveLength(2);
  });

  it("does not call refreshConfidenceSignal when the dep is unwired", async () => {
    const deps = fakeDeps({});
    const tool = createUpdateProfileTool({ deps });
    await tool.run({
      episode_id: EPISODE_ID,
      outcome: "passed",
      passed: true,
      submit_count: 1,
      hints_used: 0,
      finished_at_ms: 1700000060000,
    });
    expect(deps.refreshSignalCalls).toEqual([]);
  });

  it("signal refresh failure is swallowed: close still succeeds", async () => {
    const deps = fakeDeps({ wireSignalThrows: true });
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
    expect(out.xp_award.awarded).toBe(true);
    // The dep was attempted (and threw); we record the call so we can assert the swallow happened.
    expect(deps.refreshSignalCalls).toHaveLength(1);
  });
});

describe("createUpdateProfileTool: spaced-repetition (STORY-031)", () => {
  it("when unwired, reviews_written is empty + due_concepts_count is null", async () => {
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
    expect(out.reviews_written).toEqual([]);
    expect(out.due_concepts_count).toBeNull();
  });

  it("writes one review per resolved concept tag with the correct grade", async () => {
    const deps = fakeDeps({ wireFsrs: true });
    const tool = createUpdateProfileTool({ deps });
    const out = await tool.run({
      episode_id: EPISODE_ID,
      outcome: "passed",
      passed: true,
      submit_count: 1,
      hints_used: 0,
      finished_at_ms: 1700000060000,
    });
    expect(deps.reviewCalls).toHaveLength(2); // arrays + hash-map (missing-tag filtered)
    expect(out.reviews_written).toHaveLength(2);
    for (const r of out.reviews_written) {
      // 0 hints + finished at 60s vs expected 60s -> not under-target -> good (not easy).
      expect(r.grade).toBe("good");
      expect(typeof r.next_due).toBe("string");
    }
  });

  it("revealed → grade=again", async () => {
    const deps = fakeDeps({ wireFsrs: true });
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
    for (const r of out.reviews_written) expect(r.grade).toBe("again");
  });

  it("failed → grade=again", async () => {
    const deps = fakeDeps({ wireFsrs: true });
    const tool = createUpdateProfileTool({ deps });
    const out = await tool.run({
      episode_id: EPISODE_ID,
      outcome: "failed",
      passed: false,
      submit_count: 3,
      hints_used: 0,
      finished_at_ms: 1700000180000,
    });
    for (const r of out.reviews_written) expect(r.grade).toBe("again");
  });

  it("abandoned → grade=again", async () => {
    const deps = fakeDeps({ wireFsrs: true });
    const tool = createUpdateProfileTool({ deps });
    const out = await tool.run({
      episode_id: EPISODE_ID,
      outcome: "abandoned",
      passed: false,
      submit_count: 1,
      hints_used: 0,
      finished_at_ms: 1700000060000,
    });
    for (const r of out.reviews_written) expect(r.grade).toBe("again");
  });

  it("passed_with_hints (1 hint) → grade=good", async () => {
    const deps = fakeDeps({ wireFsrs: true });
    const tool = createUpdateProfileTool({ deps });
    const out = await tool.run({
      episode_id: EPISODE_ID,
      outcome: "passed_with_hints",
      passed: true,
      submit_count: 1,
      hints_used: 1,
      finished_at_ms: 1700000060000,
    });
    for (const r of out.reviews_written) expect(r.grade).toBe("good");
  });

  it("passed_with_hints (2 hints) → grade=hard", async () => {
    const deps = fakeDeps({ wireFsrs: true });
    const tool = createUpdateProfileTool({ deps });
    const out = await tool.run({
      episode_id: EPISODE_ID,
      outcome: "passed_with_hints",
      passed: true,
      submit_count: 1,
      hints_used: 2,
      finished_at_ms: 1700000120000,
    });
    for (const r of out.reviews_written) expect(r.grade).toBe("hard");
  });

  it("passed (0 hints, under-target time) → grade=easy", async () => {
    const deps = fakeDeps({ wireFsrs: true });
    const tool = createUpdateProfileTool({ deps });
    const out = await tool.run({
      episode_id: EPISODE_ID,
      outcome: "passed",
      passed: true,
      submit_count: 1,
      hints_used: 0,
      // 30s of 60s expected (multiplier 0.6 → 36s threshold) → easy.
      finished_at_ms: 1700000030000,
    });
    for (const r of out.reviews_written) expect(r.grade).toBe("easy");
  });

  it("FSRS write failure is swallowed: close still succeeds", async () => {
    const deps = fakeDeps({ wireFsrs: true, recordReviewThrows: true });
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
    expect(out.xp_award.awarded).toBe(true);
    expect(out.reviews_written).toEqual([]);
  });

  it("due_concepts_count surfaces the dep's count when wired", async () => {
    const deps = fakeDeps({ wireFsrs: true, dueCount: 7 });
    const tool = createUpdateProfileTool({ deps });
    const out = await tool.run({
      episode_id: EPISODE_ID,
      outcome: "passed",
      passed: true,
      submit_count: 1,
      hints_used: 0,
      finished_at_ms: 1700000060000,
    });
    expect(out.due_concepts_count).toBe(7);
  });

  it("idempotency: re-grading the same episode produces deterministic next_due", async () => {
    const deps = fakeDeps({ wireFsrs: true });
    const tool = createUpdateProfileTool({ deps });
    const a = await tool.run({
      episode_id: EPISODE_ID,
      outcome: "passed",
      passed: true,
      submit_count: 1,
      hints_used: 0,
      finished_at_ms: 1700000060000,
    });
    const b = await tool.run({
      episode_id: EPISODE_ID,
      outcome: "passed",
      passed: true,
      submit_count: 1,
      hints_used: 0,
      finished_at_ms: 1700000060000,
    });
    expect(a.reviews_written).toEqual(b.reviews_written);
  });
});
