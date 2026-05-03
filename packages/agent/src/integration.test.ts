import {
  agent_calls,
  concepts,
  createDb,
  episodes,
  organizations,
  problems,
  runMigrations,
  skill_scores,
  submissions,
  tracks,
  users,
  type LearnProDb,
} from "@learnpro/db";
import {
  AnthropicProvider,
  DEFAULT_ROLE_MODEL_MAP,
  type AnthropicTransport,
  type AnthropicCreateParams,
  type AnthropicMessageResponse,
  type LLMProvider,
} from "@learnpro/llm";
import type {
  SandboxLanguage,
  SandboxProvider,
  SandboxRunResponse,
} from "@learnpro/sandbox";
import { ProblemDefSchema, type ProblemDef } from "@learnpro/problems";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

interface PoolLike {
  end(): Promise<void>;
}
import { TutorSession } from "./tutor-session.js";
import {
  buildAssignProblemDrizzleDeps,
  buildGiveHintDrizzleDeps,
  buildGradeDrizzleDeps,
  buildUpdateProfileDrizzleDeps,
} from "./drizzle-deps.js";
import { createAssignProblemTool } from "./tools/assign-problem.js";
import { createGiveHintTool } from "./tools/give-hint.js";
import { createGradeTool } from "./tools/grade.js";
import { createUpdateProfileTool } from "./tools/update-profile.js";
import { DrizzleLLMTelemetrySink } from "@learnpro/db";

const DATABASE_URL = process.env["DATABASE_URL"];

// Integration test against a real Postgres + in-memory FakeSandbox + in-memory FakeLLMProvider.
// Asserts that the full state machine writes the right rows to episodes / submissions /
// agent_calls / skill_scores. Skipped when DATABASE_URL isn't set so CI without a DB still passes.
describe.skipIf(!DATABASE_URL)("agent integration: full state machine + DB writes", () => {
  let db: LearnProDb;
  let pool: PoolLike;
  let testUserId: string;
  let testTrackId: string;
  let testProblemId: string;

  beforeAll(async () => {
    const created = createDb({ connectionString: DATABASE_URL ?? "" });
    db = created.db;
    pool = created.pool;
    await runMigrations();
    await db.insert(organizations).values({ id: "self", name: "Self-hosted" }).onConflictDoNothing();

    const u = await db
      .insert(users)
      .values({ email: `agent-int-${Date.now()}@learnpro.local` })
      .returning({ id: users.id });
    testUserId = u[0]!.id;

    const t = await db
      .insert(tracks)
      .values({
        slug: `python-int-${Date.now()}`,
        name: "Python integration",
        language: "python",
      })
      .returning({ id: tracks.id });
    testTrackId = t[0]!.id;

    const p = await db
      .insert(problems)
      .values({
        track_id: testTrackId,
        slug: "two-sum-int",
        name: "Two sum (integration)",
        language: "python",
        difficulty: "2",
        statement: "find indices of nums summing to target",
        starter_code: "def solve(nums, target):\n    pass\n",
        hidden_tests: {
          cases: [{ input: [[2, 7], 9], expected: [0, 1] }],
          public_examples: [{ input: [[2, 7], 9], expected: [0, 1] }],
          reference_solution:
            "def solve(nums, target):\n    seen = {}\n    for i, v in enumerate(nums):\n        if target - v in seen:\n            return [seen[target - v], i]\n        seen[v] = i\n    return []\n",
          concept_tags: ["arrays", "hash-map"],
          expected_median_time_to_solve_ms: 60_000,
        },
      })
      .returning({ id: problems.id });
    testProblemId = p[0]!.id;

    // Insert concepts so updateProfile's resolveConceptIds sees something. ON CONFLICT DO NOTHING
    // makes this safe to repeat across runs.
    await db
      .insert(concepts)
      .values({ slug: "arrays", name: "Arrays", language: "python" })
      .onConflictDoNothing();
    await db
      .insert(concepts)
      .values({ slug: "hash-map", name: "Hash map", language: "python" })
      .onConflictDoNothing();
  });

  afterAll(async () => {
    if (db) {
      await db.delete(agent_calls).where(eq(agent_calls.user_id, testUserId));
      await db.delete(submissions).where(sql`true`);
      await db.delete(skill_scores).where(eq(skill_scores.user_id, testUserId));
      await db.delete(episodes).where(eq(episodes.user_id, testUserId));
      await db.delete(problems).where(eq(problems.id, testProblemId));
      await db.delete(tracks).where(eq(tracks.id, testTrackId));
      await db.delete(users).where(eq(users.id, testUserId));
    }
    await pool?.end();
  });

  beforeEach(async () => {
    await db.delete(agent_calls).where(eq(agent_calls.user_id, testUserId));
    await db.delete(submissions);
    await db.delete(skill_scores).where(eq(skill_scores.user_id, testUserId));
    await db.delete(episodes).where(eq(episodes.user_id, testUserId));
  });

  it("full happy-path: assign → submit (pass) → finish writes episodes/submissions/agent_calls/skill_scores", async () => {
    const llm = buildFakeLLM([
      // hint call (not used in this happy path, but queue for completeness)
    ]);
    const sandbox = new FakeSandbox({ pass: true });
    const catalog = [pythonCatalogDef("two-sum-int")];

    const session = makeSession({ db, llm, sandbox, catalog, userId: testUserId, trackId: testTrackId });

    await session.assign();
    expect(session.state.phase).toBe("coding");

    const grade = await session.submit("def solve(nums, target):\n    return [0, 1]\n");
    expect(grade.passed).toBe(true);
    expect(grade.submission_id).toMatch(/^[0-9a-f-]{36}$/);

    const finish = await session.finish({});
    expect(finish.final_outcome).toBe("passed");
    expect(finish.skill_updates.length).toBeGreaterThan(0);

    // DB assertions:
    const epRows = await db
      .select()
      .from(episodes)
      .where(eq(episodes.user_id, testUserId));
    expect(epRows).toHaveLength(1);
    const ep = epRows[0]!;
    expect(ep.final_outcome).toBe("passed");
    expect(ep.attempts).toBeGreaterThanOrEqual(1);
    expect(ep.finished_at).not.toBeNull();
    expect(ep.time_to_solve_ms).toBeGreaterThanOrEqual(0);

    const subRows = await db.select().from(submissions);
    expect(subRows).toHaveLength(1);
    expect(subRows[0]?.passed).toBe(true);

    const ssRows = await db
      .select()
      .from(skill_scores)
      .where(eq(skill_scores.user_id, testUserId));
    expect(ssRows.length).toBeGreaterThanOrEqual(1);
    expect(ssRows.every((r) => r.score > 50)).toBe(true);

    // agent_calls written for grade rubric LLM call (and any others).
    await flushAgentCalls(db, testUserId, 1);
    const agentCallRows = await db
      .select()
      .from(agent_calls)
      .where(eq(agent_calls.user_id, testUserId));
    expect(agentCallRows.length).toBeGreaterThanOrEqual(1);
    const promptVersions = agentCallRows.map((r) => r.prompt_version);
    expect(promptVersions.some((p) => p === "tutor-2026-05-03")).toBe(true);
  });

  it("hint + multi-submit path: passed_with_hints final_outcome lands in DB", async () => {
    const llm = buildFakeLLM([
      "Two-pass: scan once to record indices.",
      JSON.stringify({
        rubric: { correctness: 0, idiomatic: 0.5, edge_case_coverage: 0.2 },
        prose_explanation: "no improvement; missing the search loop.",
      }),
      JSON.stringify({
        rubric: { correctness: 1, idiomatic: 0.9, edge_case_coverage: 0.85 },
        prose_explanation: "solid solve.",
      }),
    ]);
    const sandbox = new FakeSandbox({ failFirst: 1 });
    const catalog = [pythonCatalogDef("two-sum-int")];

    const session = makeSession({ db, llm, sandbox, catalog, userId: testUserId, trackId: testTrackId });

    await session.assign();
    const fail = await session.submit("def solve(nums, target):\n    return []\n");
    expect(fail.passed).toBe(false);
    await session.requestHint(1);
    expect(session.state.hints).toHaveLength(1);
    const pass = await session.submit("def solve(nums, target):\n    return [0,1]\n");
    expect(pass.passed).toBe(true);
    const finish = await session.finish({});
    expect(finish.final_outcome).toBe("passed_with_hints");

    const ep = (
      await db.select().from(episodes).where(eq(episodes.user_id, testUserId))
    )[0]!;
    expect(ep.hints_used).toBeGreaterThanOrEqual(1);
    expect(ep.attempts).toBeGreaterThanOrEqual(2);
    expect(ep.final_outcome).toBe("passed_with_hints");

    const subs = await db.select().from(submissions);
    expect(subs).toHaveLength(2);
  });
});

// ---- helpers ----

function pythonCatalogDef(slug: string): ProblemDef {
  return ProblemDefSchema.parse({
    slug,
    name: "Two sum (integration)",
    language: "python",
    difficulty: 2,
    track: `python-int-${slug}`,
    concept_tags: ["arrays", "hash-map"],
    statement: "find indices of nums summing to target",
    starter_code: "def solve(nums, target):\n    pass\n",
    reference_solution:
      "def solve(nums, target):\n    seen = {}\n    for i, v in enumerate(nums):\n        if target - v in seen:\n            return [seen[target - v], i]\n        seen[v] = i\n    return []\n",
    public_examples: [{ input: [[2, 7], 9], expected: [0, 1] }],
    hidden_tests: [{ input: [[2, 7], 9], expected: [0, 1] }],
    expected_median_time_to_solve_ms: 60_000,
  });
}

function makeSession(opts: {
  db: LearnProDb;
  llm: LLMProvider;
  sandbox: SandboxProvider;
  catalog: ProblemDef[];
  userId: string;
  trackId: string;
}): TutorSession {
  const depsOpts = {
    db: opts.db,
    llm: opts.llm,
    sandbox: opts.sandbox,
    catalog: opts.catalog,
    org_id: "self",
  };
  return new TutorSession({
    user_id: opts.userId,
    org_id: "self",
    track_id: opts.trackId,
    tools: {
      assignProblem: createAssignProblemTool({ deps: buildAssignProblemDrizzleDeps(depsOpts) }),
      giveHint: createGiveHintTool({ deps: buildGiveHintDrizzleDeps(depsOpts) }),
      grade: createGradeTool({ deps: buildGradeDrizzleDeps(depsOpts) }),
      updateProfile: createUpdateProfileTool({ deps: buildUpdateProfileDrizzleDeps(depsOpts) }),
    },
  });
}

function buildFakeLLM(textQueue: string[]): LLMProvider {
  // We wrap a fake AnthropicTransport so the LLMProvider's telemetry sink fires (and writes the
  // agent_calls rows the test asserts on). DEFAULT_ROLE_MODEL_MAP picks Opus / Haiku per role.
  // The transport returns each item from textQueue in order; once exhausted, returns a stub
  // rubric JSON so the grader's fallback never kicks in.
  const queue = [...textQueue];
  const transport: AnthropicTransport = {
    async createMessage(params: AnthropicCreateParams): Promise<AnthropicMessageResponse> {
      const text =
        queue.shift() ??
        JSON.stringify({
          rubric: { correctness: 1, idiomatic: 0.8, edge_case_coverage: 0.7 },
          prose_explanation: "ok",
        });
      return {
        model: params.model,
        stop_reason: "end_turn",
        usage: { input_tokens: 50, output_tokens: 30 },
        content: [{ type: "text", text }],
      };
    },
    streamMessage() {
      return {
        [Symbol.asyncIterator]: () => ({
          next: () => Promise.resolve({ value: undefined, done: true as const }),
        }),
      };
    },
  };
  // The DrizzleLLMTelemetrySink connects writes to agent_calls. We need a `db` reference — pull
  // it from the test scope by closure (passed in via makeSession's deps).
  // For simplicity in the integration test we wire the sink to the same `db` reference.
  return new AnthropicProvider({
    transport,
    models: DEFAULT_ROLE_MODEL_MAP,
    telemetry: agentCallSinkProxy,
  });
}

// Module-scoped sink used by the fake LLM so `db` doesn't have to be threaded through. Set by
// `installAgentCallSink` in beforeAll, then drained per-test by `flushAgentCalls`.
const agentCallSinkProxy = {
  record(event: import("@learnpro/llm").LLMTelemetryEvent) {
    if (_drizzleSink) _drizzleSink.record(event);
    else _eventBuffer.push(event);
  },
};

let _drizzleSink: DrizzleLLMTelemetrySink | null = null;
const _eventBuffer: import("@learnpro/llm").LLMTelemetryEvent[] = [];

beforeAll(async () => {
  if (!DATABASE_URL) return;
  const { db } = createDb({ connectionString: DATABASE_URL });
  _drizzleSink = new DrizzleLLMTelemetrySink({ db });
  while (_eventBuffer.length > 0) _drizzleSink.record(_eventBuffer.shift()!);
});

// Sink is async — wait for `expected` rows to land before asserting.
async function flushAgentCalls(
  db: LearnProDb,
  user_id: string,
  expected: number,
  timeoutMs = 2000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rows = await db.select().from(agent_calls).where(eq(agent_calls.user_id, user_id));
    if (rows.length >= expected) return;
    await new Promise((r) => setTimeout(r, 25));
  }
}

// Local in-memory sandbox: runs the per-language harness output through a tiny mock that pretends
// the reference solution passed (or failed N times then passed) without actually shelling out.
class FakeSandbox implements SandboxProvider {
  readonly name = "fake-sandbox";
  private remainingFailures: number;
  private alwaysPass: boolean;

  constructor(opts: { pass?: boolean; failFirst?: number } = {}) {
    this.alwaysPass = opts.pass ?? false;
    this.remainingFailures = opts.failFirst ?? 0;
  }

  async run(req: { language: SandboxLanguage; code: string }): Promise<SandboxRunResponse> {
    const passed = this.alwaysPass || this.remainingFailures <= 0;
    if (!passed && this.remainingFailures > 0) this.remainingFailures -= 1;
    return {
      stdout: passed ? "__LEARNPRO_PASS__\n" : '__LEARNPRO_FAIL__{"detail":"mismatch","got":null}\n',
      stderr: "",
      exit_code: 0,
      duration_ms: 1,
      killed_by: null,
      language: req.language,
    };
  }
}
