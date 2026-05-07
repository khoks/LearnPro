import {
  agent_calls,
  bug_finding_scores,
  createDb,
  episodes,
  organizations,
  problems,
  runMigrations,
  submissions,
  tracks,
  users,
  type LearnProDb,
} from "@learnpro/db";
import type {
  CompleteRequest,
  CompleteResponse,
  EmbedRequest,
  EmbedResponse,
  LLMProvider,
  StreamChunk,
  ToolCallRequest,
  ToolCallResponse,
} from "@learnpro/llm";
import type { SandboxProvider, SandboxRunChunk, SandboxRunResponse } from "@learnpro/sandbox";
import { ProblemDefSchema, type ProblemDef } from "@learnpro/problems";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildGradeDrizzleDeps } from "./drizzle-deps.js";

interface PoolLike {
  end(): Promise<void>;
}

const DATABASE_URL = process.env["DATABASE_URL"];

// STORY-037a — focused integration test for the debug-grader runtime wiring inside
// `buildGradeDrizzleDeps`. Skipped when DATABASE_URL isn't set; mocks the LLM + sandbox so the
// only real dependency is the DB (the table CRUD + UPSERT correctness is the whole point).
describe.skipIf(!DATABASE_URL)("buildGradeDrizzleDeps: debug-grader wiring", () => {
  let db: LearnProDb;
  let pool: PoolLike;
  let testUserId: string;
  let testTrackId: string;
  let debugProblemId: string;
  let implementProblemId: string;
  let testEpisodeIdDebug: string;
  let testEpisodeIdImplement: string;

  beforeAll(async () => {
    const created = createDb({ connectionString: DATABASE_URL ?? "" });
    db = created.db;
    pool = created.pool;
    await runMigrations();
    await db
      .insert(organizations)
      .values({ id: "self", name: "Self-hosted" })
      .onConflictDoNothing();
    const u = await db
      .insert(users)
      .values({ email: `debug-grader-test-${Date.now()}@learnpro.local` })
      .returning({ id: users.id });
    testUserId = u[0]!.id;

    const t = await db
      .insert(tracks)
      .values({
        slug: `debug-grader-track-${Date.now()}`,
        name: "Debug grader track",
        language: "python",
      })
      .returning({ id: tracks.id });
    testTrackId = t[0]!.id;

    const debugRow = await db
      .insert(problems)
      .values({
        track_id: testTrackId,
        slug: "off-by-one-test",
        name: "Off by one (test)",
        language: "python",
        difficulty: "2",
        kind: "debug",
        bug_archetype: "off_by_one",
        statement: "fix the loop",
        starter_code: "def solve(n):\n    return sum(range(1, n))\n",
        hidden_tests: {
          cases: [{ input: 5, expected: 15 }],
          public_examples: [{ input: 5, expected: 15 }],
          reference_solution: "def solve(n):\n    return sum(range(1, n + 1))\n",
          concept_tags: ["loops"],
          expected_median_time_to_solve_ms: 60_000,
        },
      })
      .returning({ id: problems.id });
    debugProblemId = debugRow[0]!.id;

    const implementRow = await db
      .insert(problems)
      .values({
        track_id: testTrackId,
        slug: "two-sum-test",
        name: "Two sum (test)",
        language: "python",
        difficulty: "2",
        kind: "implement",
        statement: "find indices",
        starter_code: "def solve(nums, target):\n    pass\n",
        hidden_tests: {
          cases: [{ input: [[2, 7], 9], expected: [0, 1] }],
          public_examples: [{ input: [[2, 7], 9], expected: [0, 1] }],
          reference_solution: "def solve(): return [0, 1]\n",
          concept_tags: ["arrays"],
          expected_median_time_to_solve_ms: 60_000,
        },
      })
      .returning({ id: problems.id });
    implementProblemId = implementRow[0]!.id;
  });

  afterAll(async () => {
    if (db) {
      await db.delete(agent_calls).where(eq(agent_calls.user_id, testUserId));
      await db.delete(submissions);
      await db.delete(bug_finding_scores).where(eq(bug_finding_scores.user_id, testUserId));
      await db.delete(episodes).where(eq(episodes.user_id, testUserId));
      await db.delete(problems).where(eq(problems.id, debugProblemId));
      await db.delete(problems).where(eq(problems.id, implementProblemId));
      await db.delete(tracks).where(eq(tracks.id, testTrackId));
      await db.delete(users).where(eq(users.id, testUserId));
    }
    await pool?.end();
  });

  beforeEach(async () => {
    await db.delete(submissions);
    await db.delete(bug_finding_scores).where(eq(bug_finding_scores.user_id, testUserId));
    await db.delete(episodes).where(eq(episodes.user_id, testUserId));

    const epDebug = await db
      .insert(episodes)
      .values({
        user_id: testUserId,
        problem_id: debugProblemId,
        org_id: "self",
      })
      .returning({ id: episodes.id });
    testEpisodeIdDebug = epDebug[0]!.id;

    const epImplement = await db
      .insert(episodes)
      .values({
        user_id: testUserId,
        problem_id: implementProblemId,
        org_id: "self",
      })
      .returning({ id: episodes.id });
    testEpisodeIdImplement = epImplement[0]!.id;
  });

  it("for debug problems: runDebugGrader runs AND upsertBugFindingScore is called", async () => {
    const llm = recordingLlm([
      // First call: main grade-agent rubric.
      JSON.stringify({
        pass: true,
        rubric: { idiomatic: 4, efficiency: 4, test_coverage_thinking: 4 },
        reasoning: "Solid fix.",
      }),
      // Second call: debug grader.
      JSON.stringify({
        named_bug: true,
        inferred_archetype: "off_by_one",
        reasoning_was_coherent: true,
        summary: "Identified the off-by-one in the loop bound.",
      }),
    ]);
    const deps = buildGradeDrizzleDeps({
      db,
      llm,
      sandbox: noopSandbox(),
      catalog: [debugCatalogDef()],
      org_id: "self",
    });

    expect(deps.runGraderAgent).toBeDefined();
    const grader = await deps.runGraderAgent!({
      episode_id: testEpisodeIdDebug,
      user_id: testUserId,
      org_id: "self",
      problem: debugCatalogDef(),
      user_code: "def solve(n):\n    return sum(range(1, n + 1))\n",
      test_results: [{ index: 0, passed: true }],
    });

    expect(grader.pass).toBe(true);
    // The debug grader's summary is appended to the rubric reasoning.
    expect(grader.reasoning).toContain("Identified the off-by-one");

    expect(llm.calls).toHaveLength(2);
    expect(llm.calls[1]?.prompt_version).toMatch(/^debug-grader-/);

    const rows = await db
      .select()
      .from(bug_finding_scores)
      .where(eq(bug_finding_scores.user_id, testUserId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.bug_archetype).toBe("off_by_one");
    expect(rows[0]?.attempts).toBe(1);
    // Cold-start prev=0.5; alpha=0.4; passed+named target=1.0 → 0.7.
    expect(Number(rows[0]?.score)).toBeCloseTo(0.7, 5);
  });

  it("for implement problems: only the main grader runs; no bug_finding_scores row appears", async () => {
    const llm = recordingLlm([
      JSON.stringify({
        pass: true,
        rubric: { idiomatic: 4, efficiency: 4, test_coverage_thinking: 4 },
        reasoning: "Clean.",
      }),
    ]);
    const deps = buildGradeDrizzleDeps({
      db,
      llm,
      sandbox: noopSandbox(),
      catalog: [implementCatalogDef()],
      org_id: "self",
    });

    await deps.runGraderAgent!({
      episode_id: testEpisodeIdImplement,
      user_id: testUserId,
      org_id: "self",
      problem: implementCatalogDef(),
      user_code: "def solve(): return [0, 1]\n",
      test_results: [{ index: 0, passed: true }],
    });

    expect(llm.calls).toHaveLength(1); // only the main grader
    expect(llm.calls[0]?.prompt_version).not.toMatch(/^debug-grader-/);

    const rows = await db
      .select()
      .from(bug_finding_scores)
      .where(eq(bug_finding_scores.user_id, testUserId));
    expect(rows).toHaveLength(0);
  });

  it("a parse failure on the debug grader falls through to named_bug=false (no false positives)", async () => {
    const llm = recordingLlm([
      JSON.stringify({
        pass: false,
        rubric: { idiomatic: 3, efficiency: 3, test_coverage_thinking: 3 },
        reasoning: "Tests fail.",
      }),
      "this is not JSON at all",
    ]);
    const deps = buildGradeDrizzleDeps({
      db,
      llm,
      sandbox: noopSandbox(),
      catalog: [debugCatalogDef()],
      org_id: "self",
    });

    await deps.runGraderAgent!({
      episode_id: testEpisodeIdDebug,
      user_id: testUserId,
      org_id: "self",
      problem: debugCatalogDef(),
      user_code: "def solve(n):\n    return 0\n",
      test_results: [{ index: 0, passed: false }],
    });

    const rows = await db
      .select()
      .from(bug_finding_scores)
      .where(eq(bug_finding_scores.user_id, testUserId));
    expect(rows).toHaveLength(1);
    // Failed tests + fallback named_bug=false → target=0; cold-start 0.5 → 0.4*0 + 0.6*0.5 = 0.3.
    expect(Number(rows[0]?.score)).toBeCloseTo(0.3, 5);
  });

  it("a re-grade on the same debug episode UPSERTs the same row (no duplicates)", async () => {
    const llm = recordingLlm([
      // first close
      JSON.stringify({
        pass: true,
        rubric: { idiomatic: 4, efficiency: 4, test_coverage_thinking: 4 },
        reasoning: "ok.",
      }),
      JSON.stringify({
        named_bug: true,
        inferred_archetype: "off_by_one",
        reasoning_was_coherent: true,
        summary: "Identified the off-by-one.",
      }),
      // second close
      JSON.stringify({
        pass: true,
        rubric: { idiomatic: 4, efficiency: 4, test_coverage_thinking: 4 },
        reasoning: "ok.",
      }),
      JSON.stringify({
        named_bug: true,
        inferred_archetype: "off_by_one",
        reasoning_was_coherent: true,
        summary: "Re-identified.",
      }),
    ]);
    const deps = buildGradeDrizzleDeps({
      db,
      llm,
      sandbox: noopSandbox(),
      catalog: [debugCatalogDef()],
      org_id: "self",
    });

    await deps.runGraderAgent!({
      episode_id: testEpisodeIdDebug,
      user_id: testUserId,
      org_id: "self",
      problem: debugCatalogDef(),
      user_code: "fix1",
      test_results: [{ index: 0, passed: true }],
    });
    await deps.runGraderAgent!({
      episode_id: testEpisodeIdDebug,
      user_id: testUserId,
      org_id: "self",
      problem: debugCatalogDef(),
      user_code: "fix2",
      test_results: [{ index: 0, passed: true }],
    });

    const rows = await db
      .select()
      .from(bug_finding_scores)
      .where(eq(bug_finding_scores.user_id, testUserId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.attempts).toBe(2);
    // Second EWMA step: prev=0.7; target=1.0 → 0.4 + 0.42 = 0.82.
    expect(Number(rows[0]?.score)).toBeCloseTo(0.82, 5);
  });
});

function debugCatalogDef(): ProblemDef {
  return ProblemDefSchema.parse({
    kind: "debug",
    slug: "off-by-one-test",
    name: "Off by one (test)",
    language: "python",
    difficulty: 2,
    track: "python-fundamentals",
    concept_tags: ["loops"],
    bug_archetype: "off_by_one",
    expected_behavior: "Sum integers from 1 to n inclusive.",
    statement: "fix the loop",
    starter_code: "def solve(n):\n    return sum(range(1, n))\n",
    reference_solution: "def solve(n):\n    return sum(range(1, n + 1))\n",
    public_examples: [{ input: 5, expected: 15 }],
    hidden_tests: [{ input: 5, expected: 15 }],
    expected_median_time_to_solve_ms: 60_000,
  });
}

function implementCatalogDef(): ProblemDef {
  return ProblemDefSchema.parse({
    kind: "implement",
    slug: "two-sum-test",
    name: "Two sum (test)",
    language: "python",
    difficulty: 2,
    track: "python-fundamentals",
    concept_tags: ["arrays"],
    statement: "find indices",
    starter_code: "def solve(nums, target):\n    pass\n",
    reference_solution: "def solve(): return [0, 1]\n",
    public_examples: [{ input: [[2, 7], 9], expected: [0, 1] }],
    hidden_tests: [{ input: [[2, 7], 9], expected: [0, 1] }],
    expected_median_time_to_solve_ms: 60_000,
  });
}

function recordingLlm(textQueue: string[]): LLMProvider & { calls: CompleteRequest[] } {
  const queue = [...textQueue];
  const calls: CompleteRequest[] = [];
  return {
    name: "fake",
    calls,
    async complete(req: CompleteRequest): Promise<CompleteResponse> {
      calls.push(req);
      const text = queue.shift() ?? "{}";
      return {
        text,
        model: req.model ?? "claude-haiku-4-5-20251001",
        finish_reason: "end_turn",
        usage: { input_tokens: 50, output_tokens: 30 },
      };
    },
    async *stream(_req: CompleteRequest): AsyncIterable<StreamChunk> {
      yield { delta: "", done: true };
    },
    async embed(_req: EmbedRequest): Promise<EmbedResponse> {
      return { vector: [], model: "voyage-3", usage: {} };
    },
    async toolCall(_req: ToolCallRequest): Promise<ToolCallResponse> {
      return {
        text: "",
        tool_calls: [],
        model: "fake",
        finish_reason: "end_turn",
        usage: { input_tokens: 0, output_tokens: 0 },
      };
    },
  };
}

function noopSandbox(): SandboxProvider {
  return {
    name: "noop-sandbox",
    async run(): Promise<SandboxRunResponse> {
      return {
        stdout: "__LEARNPRO_PASS__\n",
        stderr: "",
        exit_code: 0,
        duration_ms: 1,
        killed_by: null,
        language: "python",
      };
    },
    async *runStream(): AsyncIterable<SandboxRunChunk> {
      yield { type: "stdout", line: "__LEARNPRO_PASS__" };
      yield {
        type: "exit",
        exit_code: 0,
        duration_ms: 1,
        killed_by: null,
        language: "python",
      };
    },
  };
}
