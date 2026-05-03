import type { ProblemDef } from "@learnpro/problems";
import { beforeEach, describe, expect, it } from "vitest";
import type { AssignProblemDeps, ProblemCatalogEntry, RecentEpisode } from "../ports.js";
import {
  createAssignProblemTool,
  NoEligibleProblemError,
  pickCandidate,
  pickDifficultyTier,
} from "./assign-problem.js";
import { DEFAULT_DIFFICULTY_HEURISTIC } from "@learnpro/scoring";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const TRACK_ID = "22222222-2222-4222-8222-222222222222";
const ORG_ID = "self";

function pdef(opts: { slug: string; difficulty: number }): ProblemDef {
  return {
    slug: opts.slug,
    name: `Problem ${opts.slug}`,
    language: "python",
    difficulty: opts.difficulty as ProblemDef["difficulty"],
    track: "python-fundamentals",
    concept_tags: ["fundamentals"],
    statement: "do the thing",
    starter_code: "def solve(x):\n    pass\n",
    reference_solution: "def solve(x):\n    return x\n",
    public_examples: [{ input: 1, expected: 1 }],
    hidden_tests: [{ input: 2, expected: 2 }],
    expected_median_time_to_solve_ms: 60_000,
  };
}

function entry(slug: string, difficulty: number): ProblemCatalogEntry {
  return {
    problem_id: `00000000-0000-4000-8000-${slug.padStart(12, "0").slice(0, 12)}`,
    problem_slug: slug,
    def: pdef({ slug, difficulty }),
  };
}

function fakeDeps(opts: {
  recent?: RecentEpisode[];
  catalog?: ProblemCatalogEntry[];
}): AssignProblemDeps & { calls: { createEpisode: number } } {
  const calls = { createEpisode: 0 };
  return {
    calls,
    async loadRecentEpisodes() {
      return opts.recent ?? [];
    },
    async loadProblemCatalog() {
      return opts.catalog ?? [];
    },
    async createEpisode(_input) {
      calls.createEpisode += 1;
      return {
        episode_id: `99999999-9999-4999-8999-${String(calls.createEpisode).padStart(12, "0")}`,
        started_at: 1700000000000,
      };
    },
  };
}

describe("pickDifficultyTier", () => {
  it("cold-start (no recent episodes) → cold_start tier", () => {
    const r = pickDifficultyTier({
      recent: [],
      config: DEFAULT_DIFFICULTY_HEURISTIC,
      cold_start: "easy",
    });
    expect(r.tier).toBe("easy");
    expect(r.rationale.toLowerCase()).toContain("cold-start");
  });

  it("steps up after a clean solve (positive signal)", () => {
    const recent: RecentEpisode[] = [
      {
        problem_id: "p1",
        problem_slug: "p1",
        started_at: 1700000000000,
        difficulty: "easy",
        signal: {
          passed: true,
          reveal_clicked: false,
          hints_used: 0,
          submit_count: 1,
          time_to_solve_ms: 30000,
          expected_time_ms: 60000,
        },
        final_outcome: "passed",
      },
    ];
    const r = pickDifficultyTier({
      recent,
      config: DEFAULT_DIFFICULTY_HEURISTIC,
      cold_start: "easy",
    });
    expect(r.tier).toBe("medium");
    expect(r.rationale).toContain("stepping up");
  });

  it("steps down after a struggle (overtime + many hints)", () => {
    const recent: RecentEpisode[] = [
      {
        problem_id: "p2",
        problem_slug: "p2",
        started_at: 1700000000000,
        difficulty: "medium",
        signal: {
          passed: true,
          reveal_clicked: false,
          hints_used: 3,
          submit_count: 4,
          time_to_solve_ms: 240000,
          expected_time_ms: 60000,
        },
        final_outcome: "passed_with_hints",
      },
    ];
    const r = pickDifficultyTier({
      recent,
      config: DEFAULT_DIFFICULTY_HEURISTIC,
      cold_start: "easy",
    });
    expect(r.tier).toBe("easy");
    expect(r.rationale).toContain("stepping down");
  });

  it("stays at same tier on in-band signal (mediocre solve)", () => {
    const recent: RecentEpisode[] = [
      {
        problem_id: "p3",
        problem_slug: "p3",
        started_at: 1700000000000,
        difficulty: "medium",
        signal: {
          passed: true,
          reveal_clicked: false,
          hints_used: 1,
          submit_count: 1,
          time_to_solve_ms: 70000,
          expected_time_ms: 60000,
        },
        final_outcome: "passed_with_hints",
      },
    ];
    const r = pickDifficultyTier({
      recent,
      config: DEFAULT_DIFFICULTY_HEURISTIC,
      cold_start: "easy",
    });
    expect(r.tier).toBe("medium");
    expect(r.rationale.toLowerCase()).toContain("staying");
  });
});

describe("pickCandidate", () => {
  it("picks a fresh problem in the chosen tier when one is available", () => {
    const catalog = [entry("alpha", 1), entry("beta", 1), entry("gamma", 4)];
    const recent: RecentEpisode[] = [
      {
        problem_id: catalog[0]!.problem_id,
        problem_slug: "alpha",
        started_at: 1700000000000,
        difficulty: "easy",
        signal: null,
        final_outcome: "passed",
      },
    ];
    const picked = pickCandidate({ tier: "easy", recent, catalog });
    expect(picked?.problem_slug).toBe("beta");
  });

  it("falls back to a recent-but-oldest problem when all are recent", () => {
    const catalog = [entry("alpha", 1), entry("beta", 1)];
    const recent: RecentEpisode[] = [
      {
        problem_id: catalog[0]!.problem_id,
        problem_slug: "alpha",
        started_at: 1700000010000,
        difficulty: "easy",
        signal: null,
        final_outcome: "passed",
      },
      {
        problem_id: catalog[1]!.problem_id,
        problem_slug: "beta",
        started_at: 1700000000000,
        difficulty: "easy",
        signal: null,
        final_outcome: "passed",
      },
    ];
    const picked = pickCandidate({ tier: "easy", recent, catalog });
    expect(picked?.problem_slug).toBe("beta");
  });

  it("falls back to adjacent tier when chosen tier is empty", () => {
    const catalog = [entry("alpha", 4)];
    const picked = pickCandidate({ tier: "easy", recent: [], catalog });
    expect(picked?.problem_slug).toBe("alpha");
  });

  it("returns null when the catalog is empty", () => {
    const picked = pickCandidate({ tier: "easy", recent: [], catalog: [] });
    expect(picked).toBeNull();
  });
});

describe("createAssignProblemTool", () => {
  let deps: ReturnType<typeof fakeDeps>;

  beforeEach(() => {
    deps = fakeDeps({});
  });

  it("validates input via Zod", async () => {
    const tool = createAssignProblemTool({ deps });
    await expect(
      tool.run({
        user_id: "not-a-uuid",
        org_id: ORG_ID,
        track_id: TRACK_ID,
      } as never),
    ).rejects.toThrow();
  });

  it("happy path: assigns easy problem on cold start, creates episode, returns full payload", async () => {
    const catalog = [entry("alpha", 1), entry("beta", 3), entry("gamma", 5)];
    deps = fakeDeps({ recent: [], catalog });
    const tool = createAssignProblemTool({ deps });
    const out = await tool.run({ user_id: USER_ID, org_id: ORG_ID, track_id: TRACK_ID });

    expect(out.difficulty_tier).toBe("easy");
    expect(out.problem_slug).toBe("alpha");
    expect(out.episode_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(out.problem.statement).toContain("the thing");
    expect(out.problem.concept_tags).toEqual(["fundamentals"]);
    expect(deps.calls.createEpisode).toBe(1);
    expect(out.why_this_difficulty.toLowerCase()).toContain("cold-start");
  });

  it("steps up to medium after a clean easy solve and picks a medium problem", async () => {
    const catalog = [entry("alpha", 1), entry("beta", 3), entry("gamma", 4)];
    const recent: RecentEpisode[] = [
      {
        problem_id: catalog[0]!.problem_id,
        problem_slug: "alpha",
        started_at: 1700000000000,
        difficulty: "easy",
        signal: {
          passed: true,
          reveal_clicked: false,
          hints_used: 0,
          submit_count: 1,
          time_to_solve_ms: 20000,
          expected_time_ms: 60000,
        },
        final_outcome: "passed",
      },
    ];
    deps = fakeDeps({ recent, catalog });
    const tool = createAssignProblemTool({ deps });
    const out = await tool.run({ user_id: USER_ID, org_id: ORG_ID, track_id: TRACK_ID });

    expect(out.difficulty_tier).toBe("medium");
    expect(out.problem_slug).toBe("beta");
    expect(out.why_this_difficulty).toContain("stepping up");
  });

  it("throws NoEligibleProblemError when the catalog is empty", async () => {
    deps = fakeDeps({ catalog: [] });
    const tool = createAssignProblemTool({ deps });
    await expect(
      tool.run({ user_id: USER_ID, org_id: ORG_ID, track_id: TRACK_ID }),
    ).rejects.toBeInstanceOf(NoEligibleProblemError);
  });
});
