import type { LearnProDb } from "@learnpro/db";
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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildServer } from "./index.js";
import type { SessionResolver } from "./session.js";

// STORY-039 — POST /v1/problem-variants integration tests. The route is auth-gated; cache
// reads + writes go through `@learnpro/db` helpers (mocked here); the agent runs against a
// fake LLM. Real Postgres is exercised separately via the seed-bank integration tests.

const USER_ID = "11111111-1111-4111-8111-111111111111";
const SOURCE_PROBLEM_ID = "33333333-3333-4333-8333-333333333333";

const SAMPLE_HIDDEN_PAYLOAD = {
  cases: [
    { input: [], expected: 0 },
    { input: [2, 4, 6], expected: 12 },
    { input: [1, 3, 5], expected: 0 },
  ],
  public_examples: [{ input: [1, 2, 3, 4], expected: 6 }],
  reference_solution: "def solve(nums):\n    return sum(n for n in nums if n % 2 == 0)\n",
  concept_tags: ["loops", "arithmetic"],
  expected_median_time_to_solve_ms: 60_000,
};

const SOURCE_PROBLEM_ROW = {
  id: SOURCE_PROBLEM_ID,
  slug: "sum-even-numbers",
  name: "Sum of even numbers",
  language: "python" as const,
  difficulty: "2",
  kind: "implement",
  bug_archetype: null,
  comprehension_format: null,
  answer_format: null,
  statement: "Given a list of integers, return the sum of all even numbers.",
  starter_code: "def solve(nums):\n    pass\n",
  hidden_tests: SAMPLE_HIDDEN_PAYLOAD,
  track_slug: "python-fundamentals",
};

const VALID_VARIANT_PAYLOAD = {
  kind: "implement",
  slug: "sum-even-numbers-variant-1",
  name: "Product of odd numbers",
  language: "python",
  difficulty: 2,
  track: "python-fundamentals",
  concept_tags: ["loops", "arithmetic"],
  statement:
    "Given a list of integers, return the product of all odd numbers in the list. If there are no odd numbers, return 1.",
  starter_code: "def solve(nums):\n    pass\n",
  reference_solution:
    "def solve(nums):\n    result = 1\n    for n in nums:\n        if n % 2 != 0:\n            result *= n\n    return result\n",
  public_examples: [{ input: [1, 2, 3, 4, 5], expected: 15 }],
  hidden_tests: [
    { input: [], expected: 1 },
    { input: [2, 4, 6], expected: 1 },
    { input: [1, 3, 5, 7], expected: 105 },
  ],
  expected_median_time_to_solve_ms: 60_000,
  variant_of: "sum-even-numbers",
};

// In-place fake for the Drizzle query builder used inside `loadProblemDef`. The route
// chains `db.select(...).from(...).innerJoin(...).where(...).limit(1)`; we don't need to
// validate the call chain — we just need the terminal `.limit(...)` to resolve.
function fakeDbWithProblem(rows: Array<typeof SOURCE_PROBLEM_ROW>): LearnProDb {
  const fluent: Record<string, unknown> = {};
  fluent["select"] = () => fluent;
  fluent["from"] = () => fluent;
  fluent["innerJoin"] = () => fluent;
  fluent["where"] = () => fluent;
  fluent["limit"] = async () => rows;
  return fluent as unknown as LearnProDb;
}

const listProblemVariants = vi.fn();
const insertProblemVariant = vi.fn();

vi.mock("@learnpro/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@learnpro/db")>();
  return {
    ...actual,
    listProblemVariants: (...a: Parameters<typeof actual.listProblemVariants>) =>
      listProblemVariants(...a),
    insertProblemVariant: (...a: Parameters<typeof actual.insertProblemVariant>) =>
      insertProblemVariant(...a),
  };
});

function fakeLlm(responses: string[]): LLMProvider & { calls: CompleteRequest[] } {
  const calls: CompleteRequest[] = [];
  let idx = 0;
  return {
    name: "fake",
    calls,
    async complete(req: CompleteRequest): Promise<CompleteResponse> {
      calls.push(req);
      const text = responses[Math.min(idx, responses.length - 1)] ?? "";
      idx += 1;
      return {
        text,
        model: req.model ?? "claude-haiku-4-5-20251001",
        finish_reason: "end_turn",
        usage: { input_tokens: 100, output_tokens: 200 },
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

const userSession =
  (user_id: string): SessionResolver =>
  async () => ({ user_id, org_id: "self", email: `${user_id}@x.y` });

const NULL_SESSION: SessionResolver = async () => null;

function buildApp(opts: {
  sessionResolver?: SessionResolver;
  llm?: LLMProvider;
  problemRows?: Array<typeof SOURCE_PROBLEM_ROW>;
  withProblemVariantsSurface?: boolean;
}) {
  const surfaceWired = opts.withProblemVariantsSurface !== false;
  const db = fakeDbWithProblem(opts.problemRows ?? [SOURCE_PROBLEM_ROW]);
  return buildServer({
    sessionResolver: opts.sessionResolver ?? NULL_SESSION,
    ...(opts.llm ? { llm: opts.llm } : {}),
    ...(surfaceWired
      ? {
          problemVariantsDb: db,
        }
      : {}),
  });
}

beforeEach(() => {
  listProblemVariants.mockReset();
  insertProblemVariant.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /v1/problem-variants — STORY-039", () => {
  it("returns 401 when no session", async () => {
    const app = buildApp({});
    const res = await app.inject({
      method: "POST",
      url: "/v1/problem-variants",
      payload: { source_problem_id: SOURCE_PROBLEM_ID },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("returns 400 on missing source_problem_id", async () => {
    const app = buildApp({ sessionResolver: userSession(USER_ID) });
    const res = await app.inject({
      method: "POST",
      url: "/v1/problem-variants",
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("returns 400 on non-uuid source_problem_id", async () => {
    const app = buildApp({ sessionResolver: userSession(USER_ID) });
    const res = await app.inject({
      method: "POST",
      url: "/v1/problem-variants",
      payload: { source_problem_id: "not-a-uuid" },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("returns 404 when the source problem doesn't exist", async () => {
    listProblemVariants.mockResolvedValue([]);
    const app = buildApp({
      sessionResolver: userSession(USER_ID),
      problemRows: [],
    });
    const res = await app.inject({
      method: "POST",
      url: "/v1/problem-variants",
      payload: { source_problem_id: SOURCE_PROBLEM_ID },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("source_problem_not_found");
    await app.close();
  });

  it("cache hit: returns cached variants without calling the LLM", async () => {
    listProblemVariants.mockResolvedValue([
      {
        id: "row-1",
        org_id: "self",
        source_problem_id: SOURCE_PROBLEM_ID,
        variant_def: VALID_VARIANT_PAYLOAD,
        created_at: new Date(),
      },
    ]);
    const llm = fakeLlm([JSON.stringify(VALID_VARIANT_PAYLOAD)]);
    const app = buildApp({
      sessionResolver: userSession(USER_ID),
      llm,
    });
    const res = await app.inject({
      method: "POST",
      url: "/v1/problem-variants",
      payload: { source_problem_id: SOURCE_PROBLEM_ID, count: 1 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.cache_hit).toBe(true);
    expect(body.generated).toBe(0);
    expect(body.variants).toHaveLength(1);
    expect(body.variants[0].slug).toBe("sum-even-numbers-variant-1");
    expect(llm.calls).toHaveLength(0);
    expect(insertProblemVariant).not.toHaveBeenCalled();
    await app.close();
  });

  it("cache miss: generates a variant via the LLM, persists it, returns 200", async () => {
    listProblemVariants.mockResolvedValue([]);
    insertProblemVariant.mockImplementation(
      async (_db: unknown, input: { variant_def: unknown }) => ({
        id: "row-1",
        org_id: "self",
        source_problem_id: SOURCE_PROBLEM_ID,
        variant_def: input.variant_def,
        created_at: new Date(),
      }),
    );
    const llm = fakeLlm([JSON.stringify(VALID_VARIANT_PAYLOAD)]);
    const app = buildApp({
      sessionResolver: userSession(USER_ID),
      llm,
    });
    const res = await app.inject({
      method: "POST",
      url: "/v1/problem-variants",
      payload: { source_problem_id: SOURCE_PROBLEM_ID, count: 1 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.cache_hit).toBe(false);
    expect(body.generated).toBe(1);
    expect(body.variants).toHaveLength(1);
    expect(llm.calls).toHaveLength(1);
    expect(insertProblemVariant).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it("cache partial: tops up the cache with new variants when fewer than count are cached", async () => {
    listProblemVariants.mockResolvedValue([
      {
        id: "row-1",
        org_id: "self",
        source_problem_id: SOURCE_PROBLEM_ID,
        variant_def: VALID_VARIANT_PAYLOAD,
        created_at: new Date(),
      },
    ]);
    const second = {
      ...VALID_VARIANT_PAYLOAD,
      slug: "sum-even-numbers-variant-2",
      name: "Sum of cubes",
    };
    insertProblemVariant.mockImplementation(
      async (_db: unknown, input: { variant_def: unknown }) => ({
        id: "row-2",
        org_id: "self",
        source_problem_id: SOURCE_PROBLEM_ID,
        variant_def: input.variant_def,
        created_at: new Date(),
      }),
    );
    const llm = fakeLlm([JSON.stringify(second)]);
    const app = buildApp({
      sessionResolver: userSession(USER_ID),
      llm,
    });
    const res = await app.inject({
      method: "POST",
      url: "/v1/problem-variants",
      payload: { source_problem_id: SOURCE_PROBLEM_ID, count: 2 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.cache_hit).toBe(false);
    expect(body.generated).toBe(1);
    expect(body.variants).toHaveLength(2);
    expect(llm.calls).toHaveLength(1);
    await app.close();
  });

  it("LLM returns garbage: returns 200 with empty variants (best-effort)", async () => {
    listProblemVariants.mockResolvedValue([]);
    const llm = fakeLlm(["not json", "still not json"]);
    const app = buildApp({
      sessionResolver: userSession(USER_ID),
      llm,
    });
    const res = await app.inject({
      method: "POST",
      url: "/v1/problem-variants",
      payload: { source_problem_id: SOURCE_PROBLEM_ID, count: 1 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.variants).toEqual([]);
    expect(body.generated).toBe(0);
    expect(insertProblemVariant).not.toHaveBeenCalled();
    await app.close();
  });

  it("503 when the LLM throws", async () => {
    listProblemVariants.mockResolvedValue([]);
    const throwingLlm: LLMProvider = {
      name: "throwing",
      async complete() {
        throw new Error("simulated outage");
      },
      async *stream() {
        yield { delta: "", done: true };
      },
      async embed() {
        return { vector: [], model: "voyage-3", usage: {} };
      },
      async toolCall() {
        return {
          text: "",
          tool_calls: [],
          model: "fake",
          finish_reason: "end_turn",
          usage: { input_tokens: 0, output_tokens: 0 },
        };
      },
    };
    const app = buildApp({
      sessionResolver: userSession(USER_ID),
      llm: throwingLlm,
    });
    const res = await app.inject({
      method: "POST",
      url: "/v1/problem-variants",
      payload: { source_problem_id: SOURCE_PROBLEM_ID },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toBe("variant_generation_unavailable");
    await app.close();
  });

  it("rejects non-implement source problems with 400", async () => {
    const debugRow = { ...SOURCE_PROBLEM_ROW, kind: "debug" };
    listProblemVariants.mockResolvedValue([]);
    const app = buildApp({
      sessionResolver: userSession(USER_ID),
      problemRows: [debugRow],
    });
    const res = await app.inject({
      method: "POST",
      url: "/v1/problem-variants",
      payload: { source_problem_id: SOURCE_PROBLEM_ID },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("unsupported_kind");
    await app.close();
  });
});

describe("Problem-variants route wiring — STORY-039", () => {
  it("routes 404 when problemVariantsDb is NOT supplied (graceful degrade)", async () => {
    const app = buildApp({
      sessionResolver: userSession(USER_ID),
      withProblemVariantsSurface: false,
    });
    const res = await app.inject({
      method: "POST",
      url: "/v1/problem-variants",
      payload: { source_problem_id: SOURCE_PROBLEM_ID },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe("buildVariantSpecClarityJudgeFromEnv — STORY-039d env flag", () => {
  const fakeLLM: LLMProvider = {
    name: "fake",
    async complete(_req: CompleteRequest): Promise<CompleteResponse> {
      return {
        text: "",
        model: "claude-haiku-4-5-20251001",
        finish_reason: "end_turn",
        usage: { input_tokens: 0, output_tokens: 0 },
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

  it("returns a judge when LEARNPRO_VARIANT_SPEC_CLARITY_JUDGE=1", async () => {
    const { buildVariantSpecClarityJudgeFromEnv } = await import("./problem-variants.js");
    const judge = buildVariantSpecClarityJudgeFromEnv({
      llm: fakeLLM,
      env: { LEARNPRO_VARIANT_SPEC_CLARITY_JUDGE: "1" },
    });
    expect(judge).toBeDefined();
  });

  it("returns a judge by default when ANTHROPIC_API_KEY is set", async () => {
    const { buildVariantSpecClarityJudgeFromEnv } = await import("./problem-variants.js");
    const judge = buildVariantSpecClarityJudgeFromEnv({
      llm: fakeLLM,
      env: { ANTHROPIC_API_KEY: "sk-test" },
    });
    expect(judge).toBeDefined();
  });

  it("returns undefined when LEARNPRO_VARIANT_SPEC_CLARITY_JUDGE=0", async () => {
    const { buildVariantSpecClarityJudgeFromEnv } = await import("./problem-variants.js");
    const judge = buildVariantSpecClarityJudgeFromEnv({
      llm: fakeLLM,
      env: { ANTHROPIC_API_KEY: "sk-test", LEARNPRO_VARIANT_SPEC_CLARITY_JUDGE: "0" },
    });
    expect(judge).toBeUndefined();
  });

  it("returns undefined when LEARNPRO_VARIANT_SPEC_CLARITY_JUDGE=false", async () => {
    const { buildVariantSpecClarityJudgeFromEnv } = await import("./problem-variants.js");
    const judge = buildVariantSpecClarityJudgeFromEnv({
      llm: fakeLLM,
      env: { ANTHROPIC_API_KEY: "sk-test", LEARNPRO_VARIANT_SPEC_CLARITY_JUDGE: "false" },
    });
    expect(judge).toBeUndefined();
  });

  it("returns undefined when LEARNPRO_VARIANT_SPEC_CLARITY_JUDGE=off", async () => {
    const { buildVariantSpecClarityJudgeFromEnv } = await import("./problem-variants.js");
    const judge = buildVariantSpecClarityJudgeFromEnv({
      llm: fakeLLM,
      env: { ANTHROPIC_API_KEY: "sk-test", LEARNPRO_VARIANT_SPEC_CLARITY_JUDGE: "OFF" },
    });
    expect(judge).toBeUndefined();
  });

  it("returns undefined by default when ANTHROPIC_API_KEY is NOT set (cost-safe default)", async () => {
    const { buildVariantSpecClarityJudgeFromEnv } = await import("./problem-variants.js");
    const judge = buildVariantSpecClarityJudgeFromEnv({ llm: fakeLLM, env: {} });
    expect(judge).toBeUndefined();
  });
});

describe("POST /v1/problem-variants — STORY-039d judge wiring", () => {
  it("passes the judge through to generateProblemVariant when wired (variant returned on judge pass)", async () => {
    // Use a stub judge that returns pass:true so the variant flows through.
    const stubJudge = vi.fn(async () => ({
      instruction_clarity: 5 as const,
      example_quality: 5 as const,
      concept_match: 5 as const,
      reasoning: {
        instruction_clarity: "clear",
        example_quality: "good",
        concept_match: "tags match",
      },
      pass: true,
    }));
    listProblemVariants.mockResolvedValue([]);
    insertProblemVariant.mockImplementation(async (_db: LearnProDb, args: { variant_def: unknown }) => ({
      id: "row-1",
      org_id: "self",
      source_problem_id: SOURCE_PROBLEM_ID,
      variant_def: args.variant_def,
      created_at: new Date(),
    }));
    const llm = fakeLlm([JSON.stringify(VALID_VARIANT_PAYLOAD)]);
    const db = fakeDbWithProblem([SOURCE_PROBLEM_ROW]);
    const app = buildServer({
      sessionResolver: userSession(USER_ID),
      llm,
      problemVariantsDb: db,
      variantSpecClarityJudge: stubJudge,
    });
    const res = await app.inject({
      method: "POST",
      url: "/v1/problem-variants",
      payload: { source_problem_id: SOURCE_PROBLEM_ID, count: 1 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().variants).toHaveLength(1);
    expect(stubJudge).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it("drops variants when the judge fails (returns empty variants list on persistent fail)", async () => {
    const stubJudge = vi.fn(async () => ({
      instruction_clarity: 1 as const,
      example_quality: 4 as const,
      concept_match: 5 as const,
      reasoning: {
        instruction_clarity: "the empty case is undefined",
        example_quality: "fine",
        concept_match: "fine",
      },
      pass: false,
    }));
    listProblemVariants.mockResolvedValue([]);
    const llm = fakeLlm([
      JSON.stringify({ ...VALID_VARIANT_PAYLOAD, slug: "sum-even-numbers-variant-1" }),
      JSON.stringify({ ...VALID_VARIANT_PAYLOAD, slug: "sum-even-numbers-variant-2" }),
    ]);
    const db = fakeDbWithProblem([SOURCE_PROBLEM_ROW]);
    const app = buildServer({
      sessionResolver: userSession(USER_ID),
      llm,
      problemVariantsDb: db,
      variantSpecClarityJudge: stubJudge,
    });
    const res = await app.inject({
      method: "POST",
      url: "/v1/problem-variants",
      payload: { source_problem_id: SOURCE_PROBLEM_ID, count: 1 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().variants).toEqual([]);
    expect(insertProblemVariant).not.toHaveBeenCalled();
    expect(stubJudge).toHaveBeenCalled();
    await app.close();
  });

  it("behaves as STORY-039 when no judge is supplied (variant returned without judge call)", async () => {
    listProblemVariants.mockResolvedValue([]);
    insertProblemVariant.mockImplementation(async (_db: LearnProDb, args: { variant_def: unknown }) => ({
      id: "row-1",
      org_id: "self",
      source_problem_id: SOURCE_PROBLEM_ID,
      variant_def: args.variant_def,
      created_at: new Date(),
    }));
    const llm = fakeLlm([JSON.stringify(VALID_VARIANT_PAYLOAD)]);
    const db = fakeDbWithProblem([SOURCE_PROBLEM_ROW]);
    const app = buildServer({
      sessionResolver: userSession(USER_ID),
      llm,
      problemVariantsDb: db,
    });
    const res = await app.inject({
      method: "POST",
      url: "/v1/problem-variants",
      payload: { source_problem_id: SOURCE_PROBLEM_ID, count: 1 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().variants).toHaveLength(1);
    await app.close();
  });
});
