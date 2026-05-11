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
    kind: "implement",
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
    // STORY-031: deps without spaced-repetition wiring report null + no review suggestion.
    expect(out.due_concepts_count).toBeNull();
    expect(out.review_session_suggested).toBe(false);
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

describe("createAssignProblemTool: STORY-031 spaced-repetition tie-break", () => {
  function pdefWithTags(slug: string, difficulty: number, tags: string[]): ProblemDef {
    return { ...pdef({ slug, difficulty }), concept_tags: tags };
  }
  function entryWithTags(slug: string, difficulty: number, tags: string[]): ProblemCatalogEntry {
    return {
      problem_id: `00000000-0000-4000-8000-${slug.padStart(12, "0").slice(0, 12)}`,
      problem_slug: slug,
      def: pdefWithTags(slug, difficulty, tags),
    };
  }

  it("breaks ties toward problems whose concept_tags overlap with the due set", async () => {
    // Two equally-eligible (same tier, both fresh) candidates. Default tie-break is alphabetic
    // (alpha wins). With spaced-repetition wired and `recursion` due, beta should win.
    const catalog = [
      entryWithTags("alpha", 1, ["arrays"]),
      entryWithTags("beta", 1, ["recursion"]),
    ];
    const deps: AssignProblemDeps & { calls: { createEpisode: number } } = {
      calls: { createEpisode: 0 },
      async loadRecentEpisodes() {
        return [];
      },
      async loadProblemCatalog() {
        return catalog;
      },
      async createEpisode() {
        return {
          episode_id: "99999999-9999-4999-8999-000000000001",
          started_at: 1700000000000,
        };
      },
      async loadDueConceptSlugs() {
        return ["recursion"];
      },
    };
    const tool = createAssignProblemTool({ deps });
    const out = await tool.run({ user_id: USER_ID, org_id: ORG_ID, track_id: TRACK_ID });
    expect(out.problem_slug).toBe("beta");
    expect(out.due_concepts_count).toBe(1);
    expect(out.review_session_suggested).toBe(false);
  });

  it("does not override the difficulty heuristic — still picks from the chosen tier", async () => {
    // The user is past cold-start with a clean easy solve → should step up to medium. Even
    // though `expert` problems carry the `recursion` due tag, the assigner stays at medium.
    const catalog = [
      entryWithTags("medium-no-tag", 3, ["arrays"]),
      entryWithTags("expert-with-tag", 5, ["recursion"]),
    ];
    const recent: RecentEpisode[] = [
      {
        problem_id: "00000000-0000-4000-8000-aaaa00000000",
        problem_slug: "previous",
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
    const deps: AssignProblemDeps & { calls: { createEpisode: number } } = {
      calls: { createEpisode: 0 },
      async loadRecentEpisodes() {
        return recent;
      },
      async loadProblemCatalog() {
        return catalog;
      },
      async createEpisode() {
        return {
          episode_id: "99999999-9999-4999-8999-000000000002",
          started_at: 1700000060000,
        };
      },
      async loadDueConceptSlugs() {
        return ["recursion"];
      },
    };
    const tool = createAssignProblemTool({ deps });
    const out = await tool.run({ user_id: USER_ID, org_id: ORG_ID, track_id: TRACK_ID });
    expect(out.difficulty_tier).toBe("medium");
    expect(out.problem_slug).toBe("medium-no-tag");
  });

  it("review_session_suggested=true when due_concepts_count >= 3", async () => {
    const catalog = [entryWithTags("alpha", 1, ["fundamentals"])];
    const deps: AssignProblemDeps & { calls: { createEpisode: number } } = {
      calls: { createEpisode: 0 },
      async loadRecentEpisodes() {
        return [];
      },
      async loadProblemCatalog() {
        return catalog;
      },
      async createEpisode() {
        return {
          episode_id: "99999999-9999-4999-8999-000000000003",
          started_at: 1700000060000,
        };
      },
      async loadDueConceptSlugs() {
        return ["a", "b", "c", "d"];
      },
    };
    const tool = createAssignProblemTool({ deps });
    const out = await tool.run({ user_id: USER_ID, org_id: ORG_ID, track_id: TRACK_ID });
    expect(out.due_concepts_count).toBe(4);
    expect(out.review_session_suggested).toBe(true);
  });

  it("empty due-list keeps deterministic alphabetic tie-break", async () => {
    const catalog = [
      entryWithTags("alpha", 1, ["arrays"]),
      entryWithTags("beta", 1, ["recursion"]),
    ];
    const deps: AssignProblemDeps & { calls: { createEpisode: number } } = {
      calls: { createEpisode: 0 },
      async loadRecentEpisodes() {
        return [];
      },
      async loadProblemCatalog() {
        return catalog;
      },
      async createEpisode() {
        return {
          episode_id: "99999999-9999-4999-8999-000000000004",
          started_at: 1700000060000,
        };
      },
      async loadDueConceptSlugs() {
        return [];
      },
    };
    const tool = createAssignProblemTool({ deps });
    const out = await tool.run({ user_id: USER_ID, org_id: ORG_ID, track_id: TRACK_ID });
    expect(out.problem_slug).toBe("alpha");
    expect(out.due_concepts_count).toBe(0);
    expect(out.review_session_suggested).toBe(false);
  });
});

// STORY-037 — debug-bank kind discriminator surfaces on assign.
describe("createAssignProblemTool: STORY-037 debug problem projection", () => {
  function debugEntry(slug: string, archetype: string, behavior: string): ProblemCatalogEntry {
    const def: ProblemDef = {
      kind: "debug",
      slug,
      name: `Debug ${slug}`,
      language: "python",
      difficulty: 2,
      track: "python-fundamentals",
      concept_tags: ["control-flow"],
      statement: "find and fix the bug",
      starter_code: "def solve(n):\n    return n - 1\n",
      reference_solution: "def solve(n):\n    return n\n",
      public_examples: [{ input: 1, expected: 1 }],
      hidden_tests: [{ input: 5, expected: 5 }],
      expected_median_time_to_solve_ms: 90_000,
      bug_archetype: archetype as never,
      expected_behavior: behavior,
    };
    return {
      problem_id: `00000000-0000-4000-8000-${slug.padStart(12, "0").slice(0, 12)}`,
      problem_slug: slug,
      def,
    };
  }

  it("surfaces kind=debug + bug_archetype + expected_behavior on the assign payload", async () => {
    const catalog = [debugEntry("debug-fix-it", "off_by_one", "Return n.")];
    const deps: AssignProblemDeps = {
      async loadRecentEpisodes() {
        return [];
      },
      async loadProblemCatalog() {
        return catalog;
      },
      async createEpisode() {
        return {
          episode_id: "99999999-9999-4999-8999-000000000010",
          started_at: 1700000000000,
        };
      },
    };
    const tool = createAssignProblemTool({ deps });
    const out = await tool.run({ user_id: USER_ID, org_id: ORG_ID, track_id: TRACK_ID });
    expect(out.problem.kind).toBe("debug");
    expect(out.problem.bug_archetype).toBe("off_by_one");
    expect(out.problem.expected_behavior).toBe("Return n.");
    // Debug problems pre-populate the editor with the buggy code.
    expect(out.problem.starter_code).toContain("return n - 1");
  });

  it("kind=implement defaults bug_archetype + expected_behavior to null", async () => {
    const catalog = [entry("impl-only", 1)];
    const deps: AssignProblemDeps = {
      async loadRecentEpisodes() {
        return [];
      },
      async loadProblemCatalog() {
        return catalog;
      },
      async createEpisode() {
        return {
          episode_id: "99999999-9999-4999-8999-000000000011",
          started_at: 1700000000000,
        };
      },
    };
    const tool = createAssignProblemTool({ deps });
    const out = await tool.run({ user_id: USER_ID, org_id: ORG_ID, track_id: TRACK_ID });
    expect(out.problem.kind).toBe("implement");
    expect(out.problem.bug_archetype).toBeNull();
    expect(out.problem.expected_behavior).toBeNull();
  });
});

// STORY-038a — comprehension projection. Comprehension problems are surfaced through the same
// assigner as implement+debug (no separate route any more). The projection carries the
// comprehension-specific fields (question / format / answer_format / options / index /
// explanation) and leaves the debug-only fields null. Implement+debug projections keep their
// existing shape and leave the comprehension fields null.
describe("createAssignProblemTool: STORY-038a comprehension projection", () => {
  function comprehensionEntry(opts: {
    slug: string;
    answer_format: "multiple_choice" | "free_text";
  }): ProblemCatalogEntry {
    const def: ProblemDef =
      opts.answer_format === "multiple_choice"
        ? {
            kind: "comprehension",
            slug: opts.slug,
            name: `Read ${opts.slug}`,
            language: "python",
            difficulty: 2,
            track: "python-fundamentals",
            concept_tags: ["list-comprehension"],
            statement: "Read the code and answer.",
            starter_code: "result = [x*2 for x in range(4)]\nprint(result)\n",
            expected_median_time_to_solve_ms: 60_000,
            comprehension_format: "predict_output",
            question: "What does the program print?",
            answer_format: "multiple_choice",
            multiple_choice_options: ["[0, 2, 4, 6]", "[1, 2, 3, 4]", "[0, 1, 2, 3]", "[2, 4, 6]"],
            correct_answer_index: 0,
            explanation: "range(4) is 0..3; doubling gives [0, 2, 4, 6].",
          }
        : {
            kind: "comprehension",
            slug: opts.slug,
            name: `Reason ${opts.slug}`,
            language: "python",
            difficulty: 3,
            track: "python-fundamentals",
            concept_tags: ["complexity"],
            statement: "Read the code and answer.",
            starter_code: "def fib(n):\n    return n if n < 2 else fib(n-1) + fib(n-2)\n",
            expected_median_time_to_solve_ms: 90_000,
            comprehension_format: "reason_property",
            question: "Why is this slow for n=30?",
            answer_format: "free_text",
            expected_answer:
              "Naive recursion has overlapping subproblems leading to exponential calls.",
            explanation:
              "Without memoization, fib has O(2^n) overlapping subproblems and recomputes them.",
          };
    return {
      problem_id: `00000000-0000-4000-8000-${opts.slug.padStart(12, "0").slice(0, 12)}`,
      problem_slug: opts.slug,
      def,
    };
  }

  it("surfaces comprehension fields on a multiple-choice problem (debug fields null)", async () => {
    const catalog = [comprehensionEntry({ slug: "mc-pred", answer_format: "multiple_choice" })];
    const deps: AssignProblemDeps = {
      async loadRecentEpisodes() {
        return [];
      },
      async loadProblemCatalog() {
        return catalog;
      },
      async createEpisode() {
        return {
          episode_id: "99999999-9999-4999-8999-000000000020",
          started_at: 1700000000000,
        };
      },
    };
    const tool = createAssignProblemTool({ deps });
    const out = await tool.run({ user_id: USER_ID, org_id: ORG_ID, track_id: TRACK_ID });

    expect(out.problem.kind).toBe("comprehension");
    expect(out.problem.question).toBe("What does the program print?");
    expect(out.problem.comprehension_format).toBe("predict_output");
    expect(out.problem.answer_format).toBe("multiple_choice");
    expect(out.problem.multiple_choice_options).toEqual([
      "[0, 2, 4, 6]",
      "[1, 2, 3, 4]",
      "[0, 1, 2, 3]",
      "[2, 4, 6]",
    ]);
    expect(out.problem.correct_answer_index).toBe(0);
    expect(out.problem.explanation).toContain("range(4)");
    // Debug-only fields stay null.
    expect(out.problem.bug_archetype).toBeNull();
    expect(out.problem.expected_behavior).toBeNull();
    // Comprehension YAMLs carry no hidden tests / public_examples.
    expect(out.problem.public_examples).toEqual([]);
    // Code is still surfaced (read-only in the editor).
    expect(out.problem.starter_code).toContain("range(4)");
  });

  it("surfaces comprehension fields on a free-text problem (multiple_choice fields null)", async () => {
    const catalog = [comprehensionEntry({ slug: "ft-rsn", answer_format: "free_text" })];
    const deps: AssignProblemDeps = {
      async loadRecentEpisodes() {
        return [];
      },
      async loadProblemCatalog() {
        return catalog;
      },
      async createEpisode() {
        return {
          episode_id: "99999999-9999-4999-8999-000000000021",
          started_at: 1700000000000,
        };
      },
    };
    const tool = createAssignProblemTool({ deps });
    const out = await tool.run({ user_id: USER_ID, org_id: ORG_ID, track_id: TRACK_ID });

    expect(out.problem.kind).toBe("comprehension");
    expect(out.problem.answer_format).toBe("free_text");
    expect(out.problem.comprehension_format).toBe("reason_property");
    // Free-text problems don't surface options / index.
    expect(out.problem.multiple_choice_options).toBeNull();
    expect(out.problem.correct_answer_index).toBeNull();
    expect(out.problem.explanation).toContain("memoization");
  });

  it("implement+debug projections leave comprehension fields null", async () => {
    const catalog = [entry("impl-x", 1)];
    const deps: AssignProblemDeps = {
      async loadRecentEpisodes() {
        return [];
      },
      async loadProblemCatalog() {
        return catalog;
      },
      async createEpisode() {
        return {
          episode_id: "99999999-9999-4999-8999-000000000022",
          started_at: 1700000000000,
        };
      },
    };
    const tool = createAssignProblemTool({ deps });
    const out = await tool.run({ user_id: USER_ID, org_id: ORG_ID, track_id: TRACK_ID });
    expect(out.problem.kind).toBe("implement");
    expect(out.problem.question).toBeNull();
    expect(out.problem.comprehension_format).toBeNull();
    expect(out.problem.answer_format).toBeNull();
    expect(out.problem.multiple_choice_options).toBeNull();
    expect(out.problem.correct_answer_index).toBeNull();
    expect(out.problem.explanation).toBeNull();
  });
});

// STORY-033 — assign-problem now surfaces the user's latest cross-episode insights so the
// tutor's opener can reference them. The deps adapter's `loadLatestInsights` is optional;
// when unwired the array is empty and behaviour matches the pre-STORY-033 path exactly.
describe("createAssignProblemTool: STORY-033 insight context", () => {
  it("surfaces an empty `previous_insights` when the deps adapter doesn't wire the port", async () => {
    const catalog = [entry("alpha", 1)];
    const deps = fakeDeps({ catalog });
    const tool = createAssignProblemTool({ deps });
    const out = await tool.run({ user_id: USER_ID, org_id: ORG_ID, track_id: TRACK_ID });
    expect(out.previous_insights).toEqual([]);
  });

  it("surfaces the latest 1-3 insight rows when the deps wire `loadLatestInsights`", async () => {
    const catalog = [entry("alpha", 1)];
    let lastLimit = -1;
    const deps: AssignProblemDeps = {
      ...fakeDeps({ catalog }),
      async loadLatestInsights(input) {
        lastLimit = input.limit;
        return [
          {
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            text: "user reaches for `for` when comprehensions would be cleaner",
          },
          {
            id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            text: "edge cases consistently take an extra attempt",
          },
        ];
      },
    };
    const tool = createAssignProblemTool({ deps });
    const out = await tool.run({ user_id: USER_ID, org_id: ORG_ID, track_id: TRACK_ID });
    expect(out.previous_insights).toHaveLength(2);
    expect(out.previous_insights[0]?.text).toContain("comprehensions");
    expect(lastLimit).toBe(3);
  });

  it("respects a custom insight_limit on the tool factory", async () => {
    const catalog = [entry("alpha", 1)];
    let lastLimit = -1;
    const deps: AssignProblemDeps = {
      ...fakeDeps({ catalog }),
      async loadLatestInsights(input) {
        lastLimit = input.limit;
        return [];
      },
    };
    const tool = createAssignProblemTool({ deps, insight_limit: 5 });
    await tool.run({ user_id: USER_ID, org_id: ORG_ID, track_id: TRACK_ID });
    expect(lastLimit).toBe(5);
  });
});

function variantPdef(opts: { slug: string; difficulty: number; variant_of: string }): ProblemDef {
  return {
    kind: "implement",
    slug: opts.slug,
    name: `Variant ${opts.slug}`,
    language: "python",
    difficulty: opts.difficulty as ProblemDef["difficulty"],
    track: "python-fundamentals",
    concept_tags: ["fundamentals"],
    statement: "do the thing (variant)",
    starter_code: "def solve(x):\n    pass\n",
    reference_solution: "def solve(x):\n    return x\n",
    public_examples: [{ input: 1, expected: 1 }],
    hidden_tests: [{ input: 2, expected: 2 }],
    expected_median_time_to_solve_ms: 60_000,
    variant_of: opts.variant_of,
  };
}

// STORY-039c — per-user "already seen the seed" tracking. When the user has closed an episode
// on the chosen seed AND a cached LLM-generated variant exists for that seed, the assigner
// swaps to the variant. Cold-start (no seen seed) or seen-but-no-variant fall back to the seed.
describe("pickCandidate: STORY-039c variant-preference for seen seeds", () => {
  it("cold-start (no seen slugs) returns the original seed", () => {
    const catalog = [entry("alpha", 1)];
    const picked = pickCandidate({
      tier: "easy",
      recent: [],
      catalog,
      seen_slugs: [],
      unattempted_variants_by_source: new Map(),
    });
    expect(picked?.problem_slug).toBe("alpha");
  });

  it("seen seed + unattempted variant in map → returns the variant", () => {
    const seed = entry("alpha", 1);
    const variantEntry: ProblemCatalogEntry = {
      problem_id: "ffffffff-ffff-4fff-8fff-000000000001",
      problem_slug: "alpha-variant-1",
      def: variantPdef({ slug: "alpha-variant-1", difficulty: 1, variant_of: "alpha" }),
      source_problem_id: seed.problem_id,
    };
    const variants = new Map<string, ProblemCatalogEntry>();
    variants.set(seed.problem_id, variantEntry);
    const picked = pickCandidate({
      tier: "easy",
      recent: [],
      catalog: [seed],
      seen_slugs: ["alpha"],
      unattempted_variants_by_source: variants,
    });
    expect(picked?.problem_slug).toBe("alpha-variant-1");
    expect(picked?.source_problem_id).toBe(seed.problem_id);
  });

  it("seen seed but no variant in map → falls back to the original seed", () => {
    const seed = entry("alpha", 1);
    const picked = pickCandidate({
      tier: "easy",
      recent: [],
      catalog: [seed],
      seen_slugs: ["alpha"],
      unattempted_variants_by_source: new Map(),
    });
    expect(picked?.problem_slug).toBe("alpha");
    expect(picked?.source_problem_id).toBeUndefined();
  });

  it("unseen seed even with a variant available → returns the seed (variant cache untouched)", () => {
    const seed = entry("alpha", 1);
    const variantEntry: ProblemCatalogEntry = {
      problem_id: "ffffffff-ffff-4fff-8fff-000000000002",
      problem_slug: "alpha-variant-2",
      def: variantPdef({ slug: "alpha-variant-2", difficulty: 1, variant_of: "alpha" }),
      source_problem_id: seed.problem_id,
    };
    const variants = new Map<string, ProblemCatalogEntry>();
    variants.set(seed.problem_id, variantEntry);
    const picked = pickCandidate({
      tier: "easy",
      recent: [],
      catalog: [seed],
      seen_slugs: [],
      unattempted_variants_by_source: variants,
    });
    expect(picked?.problem_slug).toBe("alpha");
  });
});

// STORY-039c — full tool path: when the deps adapter wires the variant ports, the assigner
// stamps the resulting episode's `is_variant_of_problem_id` and surfaces the variant's payload.
describe("createAssignProblemTool: STORY-039c variant swap end-to-end", () => {
  const SEED_ID = "11111111-1111-4111-8111-aaaaaaaaaaaa";
  const VARIANT_ID = "22222222-2222-4222-8222-bbbbbbbbbbbb";

  it("seen seed → assigns the variant problem + stamps episode lineage", async () => {
    const seed: ProblemCatalogEntry = {
      problem_id: SEED_ID,
      problem_slug: "alpha",
      def: pdef({ slug: "alpha", difficulty: 1 }),
    };
    const variantEntry: ProblemCatalogEntry = {
      problem_id: VARIANT_ID,
      problem_slug: "alpha-variant-1",
      def: variantPdef({ slug: "alpha-variant-1", difficulty: 1, variant_of: "alpha" }),
      source_problem_id: SEED_ID,
    };
    let stampedSeedId: string | null | undefined = undefined;
    const deps: AssignProblemDeps = {
      async loadRecentEpisodes() {
        return [];
      },
      async loadProblemCatalog() {
        return [seed];
      },
      async createEpisode(input) {
        stampedSeedId = input.is_variant_of_problem_id;
        return {
          episode_id: "99999999-9999-4999-8999-000000000030",
          started_at: 1700000000000,
        };
      },
      async loadSeenSourceSlugs() {
        return ["alpha"];
      },
      async loadUnattemptedVariantsBySource() {
        const m = new Map<string, ProblemCatalogEntry>();
        m.set(SEED_ID, variantEntry);
        return m;
      },
    };
    const tool = createAssignProblemTool({ deps });
    const out = await tool.run({ user_id: USER_ID, org_id: ORG_ID, track_id: TRACK_ID });
    expect(out.problem_id).toBe(VARIANT_ID);
    expect(out.problem_slug).toBe("alpha-variant-1");
    expect(stampedSeedId).toBe(SEED_ID);
  });

  it("unseen seed → assigns the seed and leaves is_variant_of_problem_id null", async () => {
    const seed: ProblemCatalogEntry = {
      problem_id: SEED_ID,
      problem_slug: "alpha",
      def: pdef({ slug: "alpha", difficulty: 1 }),
    };
    let stampedSeedId: string | null | undefined = undefined;
    const deps: AssignProblemDeps = {
      async loadRecentEpisodes() {
        return [];
      },
      async loadProblemCatalog() {
        return [seed];
      },
      async createEpisode(input) {
        stampedSeedId = input.is_variant_of_problem_id;
        return {
          episode_id: "99999999-9999-4999-8999-000000000031",
          started_at: 1700000000000,
        };
      },
      async loadSeenSourceSlugs() {
        return [];
      },
      async loadUnattemptedVariantsBySource() {
        return new Map();
      },
    };
    const tool = createAssignProblemTool({ deps });
    const out = await tool.run({ user_id: USER_ID, org_id: ORG_ID, track_id: TRACK_ID });
    expect(out.problem_id).toBe(SEED_ID);
    expect(stampedSeedId).toBeNull();
  });
});
