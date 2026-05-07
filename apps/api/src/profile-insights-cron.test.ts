import { beforeEach, describe, expect, it, vi } from "vitest";
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

// STORY-033 — Unit tests for the profile-insights cron wiring.
//
// We mock @learnpro/db's helpers so we don't need a real Postgres for these tests; the actual
// DB roundtrip is exercised by `packages/db/src/profile-insights.test.ts` (gated on
// DATABASE_URL, mirroring STORY-042's pattern). The Redis/BullMQ side is similarly stubbed: we
// drive `runProfileInsightsJob` directly with a fake job + fake LLM. A separate
// LEARNPRO_REQUIRE_REDIS=1 integration test could exercise the Worker path, deferred to v1.

interface FakeEpisode {
  episode_id: string;
  problem_slug: string;
  problem_name: string;
  problem_language: "python" | "typescript";
  concept_tags: string[];
  final_outcome: string | null;
  hints_used: number;
  attempts: number;
  time_to_solve_ms: number | null;
  finished_at: Date | null;
}

const dbState: {
  episodes: FakeEpisode[];
  previousInsights: Array<{ insight_text: string }>;
  writes: Array<{
    user_id: string;
    insight_text: string;
    concept_tags: ReadonlyArray<string>;
    episodes_covered: ReadonlyArray<string>;
  }>;
} = { episodes: [], previousInsights: [], writes: [] };

vi.mock("@learnpro/db", () => ({
  listEpisodesForSynthesis: vi.fn(async () => dbState.episodes),
  listLatestInsights: vi.fn(async () => dbState.previousInsights),
  insertInsight: vi.fn(
    async (
      _db: unknown,
      input: {
        user_id: string;
        insight_text: string;
        concept_tags?: ReadonlyArray<string>;
        episodes_covered?: ReadonlyArray<string>;
      },
    ) => {
      const row = {
        user_id: input.user_id,
        insight_text: input.insight_text,
        concept_tags: input.concept_tags ?? [],
        episodes_covered: input.episodes_covered ?? [],
      };
      dbState.writes.push(row);
      return {
        id: `insight-${dbState.writes.length}`,
        org_id: "self",
        referenced_count: 0,
        created_at: new Date(),
        expires_at: new Date(),
        ...row,
      };
    },
  ),
}));

import {
  ProfileInsightsJobPayloadSchema,
  buildBullConnectionFromEnv,
  enqueueProfileInsightsJob,
  runProfileInsightsJob,
} from "./profile-insights-cron.js";

class FakeLLM implements LLMProvider {
  readonly name = "fake";
  responseText: string;
  callCount = 0;
  lastReq: CompleteRequest | null = null;
  constructor(responseText: string) {
    this.responseText = responseText;
  }
  async complete(req: CompleteRequest): Promise<CompleteResponse> {
    this.callCount += 1;
    this.lastReq = req;
    return {
      text: this.responseText,
      model: req.model ?? "fake",
      finish_reason: "end_turn",
      usage: { input_tokens: 100, output_tokens: 50 },
    };
  }
  stream(_req: CompleteRequest): AsyncIterable<StreamChunk> {
    return {
      [Symbol.asyncIterator]: () => ({
        next: async () => ({ value: undefined, done: true }),
      }),
    };
  }
  async embed(_req: EmbedRequest): Promise<EmbedResponse> {
    return { vector: [0], model: "fake", usage: {} };
  }
  async toolCall(_req: ToolCallRequest): Promise<ToolCallResponse> {
    return {
      text: "",
      tool_calls: [],
      model: "fake",
      finish_reason: "end_turn",
      usage: { input_tokens: 0, output_tokens: 0 },
    };
  }
}

beforeEach(() => {
  dbState.episodes = [];
  dbState.previousInsights = [];
  dbState.writes = [];
});

function makeEpisode(id: string, slug: string): FakeEpisode {
  return {
    episode_id: id,
    problem_slug: slug,
    problem_name: slug,
    problem_language: "python",
    concept_tags: ["arrays"],
    final_outcome: "passed",
    hints_used: 0,
    attempts: 1,
    time_to_solve_ms: 60_000,
    finished_at: new Date(),
  };
}

describe("ProfileInsightsJobPayloadSchema", () => {
  it("rejects bodies without user_id / episode_id", () => {
    const r = ProfileInsightsJobPayloadSchema.safeParse({});
    expect(r.success).toBe(false);
  });
  it("accepts a valid payload", () => {
    const r = ProfileInsightsJobPayloadSchema.safeParse({
      user_id: "11111111-1111-4111-8111-111111111111",
      episode_id: "22222222-2222-4222-8222-222222222222",
    });
    expect(r.success).toBe(true);
  });
});

describe("buildBullConnectionFromEnv", () => {
  it("returns null when REDIS_URL is unset", () => {
    expect(buildBullConnectionFromEnv({})).toBeNull();
  });
  it("parses a redis:// URL into ConnectionOptions", () => {
    const opts = buildBullConnectionFromEnv({ REDIS_URL: "redis://example.com:6380/2" });
    expect(opts).not.toBeNull();
    expect(opts).toMatchObject({ host: "example.com", port: 6380, db: 2 });
  });
  it("parses a redis URL with username + password", () => {
    const opts = buildBullConnectionFromEnv({
      REDIS_URL: "redis://user:p%40ss@example.com:6379",
    });
    expect(opts).toMatchObject({
      host: "example.com",
      port: 6379,
      username: "user",
      password: "p@ss",
    });
  });
});

describe("runProfileInsightsJob", () => {
  it("short-circuits when there are too few episodes (no LLM call)", async () => {
    const llm = new FakeLLM(JSON.stringify({ insights: [] }));
    const result = await runProfileInsightsJob(
      {
        data: {
          user_id: "11111111-1111-4111-8111-111111111111",
          episode_id: "22222222-2222-4222-8222-222222222222",
        },
      },
      { db: {} as unknown as import("@learnpro/db").LearnProDb, llm },
    );
    expect(result.skipped_thin_data).toBe(true);
    expect(result.insights_written).toBe(0);
    expect(llm.callCount).toBe(0);
    expect(dbState.writes).toHaveLength(0);
  });

  it("calls the LLM and writes one insight per emitted observation", async () => {
    dbState.episodes = [
      makeEpisode("11111111-1111-4111-8111-111111111111", "two-sum"),
      makeEpisode("22222222-2222-4222-8222-222222222222", "valid-parens"),
      makeEpisode("33333333-3333-4333-8333-333333333333", "reverse-string"),
    ];
    const llm = new FakeLLM(
      JSON.stringify({
        insights: [
          {
            text: "The learner reaches for `for` when comprehensions would be cleaner.",
            concept_tags: ["arrays"],
            episodes_referenced: ["11111111-1111-4111-8111-111111111111"],
          },
          {
            text: "Edge cases consistently take an extra attempt across stack problems.",
            concept_tags: ["arrays"],
            episodes_referenced: ["22222222-2222-4222-8222-222222222222"],
          },
        ],
      }),
    );
    const result = await runProfileInsightsJob(
      {
        data: {
          user_id: "11111111-1111-4111-8111-111111111111",
          episode_id: "44444444-4444-4444-8444-444444444444",
        },
      },
      { db: {} as unknown as import("@learnpro/db").LearnProDb, llm },
    );
    expect(llm.callCount).toBe(1);
    expect(result.insights_written).toBe(2);
    expect(result.fallback_used).toBe(false);
    expect(result.skipped_thin_data).toBe(false);
    expect(result.episode_count_in_window).toBe(3);
    expect(dbState.writes).toHaveLength(2);
    expect(dbState.writes[0]?.insight_text).toContain("comprehensions");
    expect(llm.lastReq?.role).toBe("reflection");
    expect(llm.lastReq?.prompt_version).toBe("profile-insights-v1");
  });

  it("forwards previous insights to the prompt to nudge variation", async () => {
    dbState.episodes = [
      makeEpisode("11111111-1111-4111-8111-111111111111", "p1"),
      makeEpisode("22222222-2222-4222-8222-222222222222", "p2"),
      makeEpisode("33333333-3333-4333-8333-333333333333", "p3"),
    ];
    dbState.previousInsights = [{ insight_text: "PRIOR_INSIGHT_PHRASE" }];
    const llm = new FakeLLM(JSON.stringify({ insights: [] }));
    await runProfileInsightsJob(
      {
        data: {
          user_id: "11111111-1111-4111-8111-111111111111",
          episode_id: "44444444-4444-4444-8444-444444444444",
        },
      },
      { db: {} as unknown as import("@learnpro/db").LearnProDb, llm },
    );
    const userMsg = llm.lastReq?.messages[0]?.content ?? "";
    expect(userMsg).toContain("PRIOR_INSIGHT_PHRASE");
  });

  it("counts filtered insights but doesn't write them", async () => {
    dbState.episodes = [
      makeEpisode("11111111-1111-4111-8111-111111111111", "p1"),
      makeEpisode("22222222-2222-4222-8222-222222222222", "p2"),
      makeEpisode("33333333-3333-4333-8333-333333333333", "p3"),
    ];
    const llm = new FakeLLM(
      JSON.stringify({
        insights: [
          { text: "you struggle with recursion", concept_tags: [], episodes_referenced: [] },
          {
            text: "the learner consistently warms up before pushing harder",
            concept_tags: [],
            episodes_referenced: [],
          },
        ],
      }),
    );
    const result = await runProfileInsightsJob(
      {
        data: {
          user_id: "11111111-1111-4111-8111-111111111111",
          episode_id: "55555555-5555-4555-8555-555555555555",
        },
      },
      { db: {} as unknown as import("@learnpro/db").LearnProDb, llm },
    );
    expect(result.insights_written).toBe(1);
    expect(result.filtered_out).toBe(1);
    expect(dbState.writes).toHaveLength(1);
    expect(dbState.writes[0]?.insight_text).toContain("warms up");
  });

  it("returns fallback_used=true on unparseable LLM output and writes nothing", async () => {
    dbState.episodes = [
      makeEpisode("11111111-1111-4111-8111-111111111111", "p1"),
      makeEpisode("22222222-2222-4222-8222-222222222222", "p2"),
      makeEpisode("33333333-3333-4333-8333-333333333333", "p3"),
    ];
    const llm = new FakeLLM("definitely not JSON");
    const result = await runProfileInsightsJob(
      {
        data: {
          user_id: "11111111-1111-4111-8111-111111111111",
          episode_id: "66666666-6666-4666-8666-666666666666",
        },
      },
      { db: {} as unknown as import("@learnpro/db").LearnProDb, llm },
    );
    expect(result.fallback_used).toBe(true);
    expect(result.insights_written).toBe(0);
    expect(dbState.writes).toHaveLength(0);
  });
});

describe("enqueueProfileInsightsJob", () => {
  it("is a no-op when cron is null (REDIS_URL unset path)", async () => {
    const log = vi.fn();
    const r = await enqueueProfileInsightsJob(
      {
        user_id: "11111111-1111-4111-8111-111111111111",
        episode_id: "22222222-2222-4222-8222-222222222222",
      },
      { cron: null, log },
    );
    expect(r.enqueued).toBe(false);
    expect(log).toHaveBeenCalledTimes(1);
  });

  it("forwards the validated payload to the queue when wired", async () => {
    const add = vi.fn().mockResolvedValue({ id: "job-1" });
    const fakeCron = {
      queue: { add } as unknown as import("bullmq").Queue,
      worker: {} as unknown as import("bullmq").Worker,
      close: async () => {},
    };
    const r = await enqueueProfileInsightsJob(
      {
        user_id: "11111111-1111-4111-8111-111111111111",
        episode_id: "22222222-2222-4222-8222-222222222222",
      },
      { cron: fakeCron },
    );
    expect(r.enqueued).toBe(true);
    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith(
      "synthesize",
      expect.objectContaining({
        user_id: "11111111-1111-4111-8111-111111111111",
        episode_id: "22222222-2222-4222-8222-222222222222",
      }),
      expect.any(Object),
    );
  });

  it("rejects an invalid payload (Zod throws)", async () => {
    await expect(
      enqueueProfileInsightsJob(
        // Force the bad shape past TS — we want to confirm Zod rejects at runtime.
        { user_id: "not-a-uuid" } as never,
        { cron: null },
      ),
    ).rejects.toThrow();
  });
});
