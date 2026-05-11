import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
import type { CheatsheetView, LearnProDb } from "@learnpro/db";
import type { CheatsheetEpisodeFetcher } from "./cheatsheet.js";

// STORY-041a — unit tests for the cheatsheet BullMQ cron wiring.
//
// We mock @learnpro/db's helpers so we don't need a real Postgres for these tests; the actual
// DB roundtrip is exercised by `packages/db/src/cheatsheets.test.ts`. The Redis/BullMQ side is
// stubbed: we drive `runCheatsheetJob` directly with a fake job + fake fetcher + fake LLM.

const findCheatsheetForEpisodes = vi.fn();
const createCheatsheet = vi.fn();

vi.mock("@learnpro/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@learnpro/db")>();
  return {
    ...actual,
    findCheatsheetForEpisodes: (...a: Parameters<typeof actual.findCheatsheetForEpisodes>) =>
      findCheatsheetForEpisodes(...a),
    createCheatsheet: (...a: Parameters<typeof actual.createCheatsheet>) => createCheatsheet(...a),
  };
});

import {
  CheatsheetJobPayloadSchema,
  enqueueCheatsheetJob,
  runCheatsheetJob,
} from "./cheatsheet-cron.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const EPISODE_1 = "22222222-2222-4222-8222-222222222222";
const EPISODE_2 = "33333333-3333-4333-8333-333333333333";
const CHEATSHEET_ID = "44444444-4444-4444-8444-444444444444";

const fakeDb = {} as unknown as LearnProDb;

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
      usage: { input_tokens: 100, output_tokens: 200 },
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

function sampleEpisodeInput() {
  return {
    problem_slug: "two-sum",
    problem_name: "Two sum",
    language: "python" as const,
    difficulty: "easy",
    concept_tags: ["arrays", "hash-map"],
    final_outcome: "passed",
    hints_used: 0,
    user_code_excerpt: "def solve(): return [0, 1]",
    problem_statement: "Sum to target.",
  };
}

const sampleEntries = [
  {
    concept: "Hash-map lookup",
    definition: "Trade space for time when scanning for a paired value.",
    code_example: "seen = {}\nfor i, x in enumerate(nums): ...",
    gotcha: "Insert AFTER the lookup.",
  },
];

function fakeFetcher(
  episodes: ReadonlyArray<ReturnType<typeof sampleEpisodeInput>>,
): CheatsheetEpisodeFetcher & { calls: Array<{ user_id: string; episode_ids: string[] }> } {
  const calls: Array<{ user_id: string; episode_ids: string[] }> = [];
  return {
    calls,
    async fetch(input) {
      calls.push({ user_id: input.user_id, episode_ids: [...input.episode_ids] });
      return episodes;
    },
  };
}

function fakeView(overrides: Partial<CheatsheetView> = {}): CheatsheetView {
  return {
    id: CHEATSHEET_ID,
    user_id: USER_ID,
    org_id: "self",
    episodes_covered: [EPISODE_1, EPISODE_2].sort(),
    entries: sampleEntries,
    markdown_content: "# notes",
    created_at: new Date("2026-05-07T10:00:00Z"),
    updated_at: new Date("2026-05-07T10:00:00Z"),
    ...overrides,
  };
}

beforeEach(() => {
  findCheatsheetForEpisodes.mockReset();
  createCheatsheet.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("CheatsheetJobPayloadSchema", () => {
  it("rejects bodies without user_id", () => {
    const r = CheatsheetJobPayloadSchema.safeParse({ episode_ids: [EPISODE_1] });
    expect(r.success).toBe(false);
  });

  it("rejects bodies with empty episode_ids", () => {
    const r = CheatsheetJobPayloadSchema.safeParse({ user_id: USER_ID, episode_ids: [] });
    expect(r.success).toBe(false);
  });

  it("rejects bodies with > 20 episode_ids", () => {
    const tooMany = Array.from({ length: 21 }, () => EPISODE_1);
    const r = CheatsheetJobPayloadSchema.safeParse({ user_id: USER_ID, episode_ids: tooMany });
    expect(r.success).toBe(false);
  });

  it("accepts a valid payload", () => {
    const r = CheatsheetJobPayloadSchema.safeParse({
      user_id: USER_ID,
      episode_ids: [EPISODE_1, EPISODE_2],
    });
    expect(r.success).toBe(true);
  });
});

describe("runCheatsheetJob", () => {
  it("idempotent: skips when findCheatsheetForEpisodes matches (no LLM, no insert)", async () => {
    const existing = fakeView();
    findCheatsheetForEpisodes.mockResolvedValue(existing);
    const fetcher = fakeFetcher([sampleEpisodeInput()]);
    const llm = new FakeLLM(JSON.stringify({ entries: sampleEntries }));
    const result = await runCheatsheetJob(
      { data: { user_id: USER_ID, episode_ids: [EPISODE_2, EPISODE_1] } },
      { db: fakeDb, llm, episodeFetcher: fetcher },
    );
    expect(result.skipped_idempotent).toBe(true);
    expect(result.generated).toBe(false);
    expect(result.cheatsheet_id).toBe(CHEATSHEET_ID);
    expect(llm.callCount).toBe(0);
    expect(fetcher.calls).toHaveLength(0);
    expect(createCheatsheet).not.toHaveBeenCalled();
    // The idempotency lookup canonicalises the episode order.
    expect(findCheatsheetForEpisodes).toHaveBeenCalledWith(fakeDb, USER_ID, [EPISODE_1, EPISODE_2]);
  });

  it("skips when the fetcher returns zero episodes (no LLM, no insert)", async () => {
    findCheatsheetForEpisodes.mockResolvedValue(null);
    const fetcher = fakeFetcher([]);
    const llm = new FakeLLM(JSON.stringify({ entries: sampleEntries }));
    const result = await runCheatsheetJob(
      { data: { user_id: USER_ID, episode_ids: [EPISODE_1] } },
      { db: fakeDb, llm, episodeFetcher: fetcher },
    );
    expect(result.skipped_no_episodes).toBe(true);
    expect(result.generated).toBe(false);
    expect(result.cheatsheet_id).toBeNull();
    expect(llm.callCount).toBe(0);
    expect(createCheatsheet).not.toHaveBeenCalled();
  });

  it("happy path: fetches, calls cheatsheetAgent, persists via createCheatsheet", async () => {
    findCheatsheetForEpisodes.mockResolvedValue(null);
    const persisted = fakeView();
    createCheatsheet.mockResolvedValue(persisted);
    const fetcher = fakeFetcher([sampleEpisodeInput()]);
    const llm = new FakeLLM(JSON.stringify({ entries: sampleEntries }));
    const result = await runCheatsheetJob(
      { data: { user_id: USER_ID, episode_ids: [EPISODE_2, EPISODE_1] } },
      { db: fakeDb, llm, episodeFetcher: fetcher },
    );
    expect(result.generated).toBe(true);
    expect(result.cheatsheet_id).toBe(CHEATSHEET_ID);
    expect(result.fallback_used).toBe(false);
    expect(llm.callCount).toBe(1);
    expect(llm.lastReq?.role).toBe("reflection");
    expect(llm.lastReq?.prompt_version).toContain("cheatsheet-v1");
    const sorted = [EPISODE_1, EPISODE_2].sort();
    expect(fetcher.calls[0]?.episode_ids).toEqual(sorted);
    expect(createCheatsheet).toHaveBeenCalledWith(
      fakeDb,
      expect.objectContaining({
        user_id: USER_ID,
        episodes_covered: sorted,
        entries: expect.any(Array),
      }),
    );
  });

  it("forwards max_entries override to the agent (cap effective)", async () => {
    findCheatsheetForEpisodes.mockResolvedValue(null);
    createCheatsheet.mockResolvedValue(fakeView());
    const fetcher = fakeFetcher([sampleEpisodeInput()]);
    // Three valid entries; cap should drop to 1.
    const threeEntries = [
      sampleEntries[0],
      { ...sampleEntries[0], concept: "Two" },
      { ...sampleEntries[0], concept: "Three" },
    ];
    const llm = new FakeLLM(JSON.stringify({ entries: threeEntries }));
    const result = await runCheatsheetJob(
      { data: { user_id: USER_ID, episode_ids: [EPISODE_1] } },
      { db: fakeDb, llm, episodeFetcher: fetcher, max_entries: 1 },
    );
    expect(result.generated).toBe(true);
    const persistedEntries = createCheatsheet.mock.calls[0]?.[1].entries;
    expect(persistedEntries).toHaveLength(1);
  });

  it("fallback_used=true when the LLM output is unparseable; still persists empty entries", async () => {
    findCheatsheetForEpisodes.mockResolvedValue(null);
    createCheatsheet.mockResolvedValue(fakeView({ entries: [] }));
    const fetcher = fakeFetcher([sampleEpisodeInput()]);
    const llm = new FakeLLM("definitely not JSON");
    const result = await runCheatsheetJob(
      { data: { user_id: USER_ID, episode_ids: [EPISODE_1] } },
      { db: fakeDb, llm, episodeFetcher: fetcher },
    );
    expect(result.generated).toBe(true);
    expect(result.fallback_used).toBe(true);
    expect(createCheatsheet).toHaveBeenCalledTimes(1);
    const persistedEntries = createCheatsheet.mock.calls[0]?.[1].entries;
    expect(persistedEntries).toEqual([]);
  });
});

describe("enqueueCheatsheetJob", () => {
  it("is a no-op when cron is null (REDIS_URL unset path)", async () => {
    const log = vi.fn();
    const r = await enqueueCheatsheetJob(
      { user_id: USER_ID, episode_ids: [EPISODE_1] },
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
    const r = await enqueueCheatsheetJob(
      { user_id: USER_ID, episode_ids: [EPISODE_1, EPISODE_2] },
      { cron: fakeCron },
    );
    expect(r.enqueued).toBe(true);
    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith(
      "generate",
      expect.objectContaining({ user_id: USER_ID, episode_ids: [EPISODE_1, EPISODE_2] }),
      expect.any(Object),
    );
  });

  it("rejects an invalid payload (Zod throws)", async () => {
    await expect(
      enqueueCheatsheetJob(
        // Force the bad shape past TS — we want to confirm Zod rejects at runtime.
        { user_id: "not-a-uuid", episode_ids: [EPISODE_1] } as never,
        { cron: null },
      ),
    ).rejects.toThrow();
  });

  it("rejects an empty episode_ids array (Zod throws)", async () => {
    await expect(
      enqueueCheatsheetJob({ user_id: USER_ID, episode_ids: [] } as never, { cron: null }),
    ).rejects.toThrow();
  });
});
