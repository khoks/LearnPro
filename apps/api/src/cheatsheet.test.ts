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
import type { CheatsheetEpisodeFetcher } from "./cheatsheet.js";
import type { SessionResolver } from "./session.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "44444444-4444-4444-8444-444444444444";
const CHEATSHEET_ID = "22222222-2222-4222-8222-222222222222";
const EPISODE_1 = "33333333-3333-4333-8333-333333333333";
const EPISODE_2 = "55555555-5555-4555-8555-555555555555";

const createCheatsheet = vi.fn();
const findCheatsheetForEpisodes = vi.fn();
const getCheatsheetForUser = vi.fn();
const listCheatsheetsForUser = vi.fn();
const updateCheatsheetMarkdown = vi.fn();

vi.mock("@learnpro/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@learnpro/db")>();
  return {
    ...actual,
    createCheatsheet: (...a: Parameters<typeof actual.createCheatsheet>) => createCheatsheet(...a),
    findCheatsheetForEpisodes: (...a: Parameters<typeof actual.findCheatsheetForEpisodes>) =>
      findCheatsheetForEpisodes(...a),
    getCheatsheetForUser: (...a: Parameters<typeof actual.getCheatsheetForUser>) =>
      getCheatsheetForUser(...a),
    listCheatsheetsForUser: (...a: Parameters<typeof actual.listCheatsheetsForUser>) =>
      listCheatsheetsForUser(...a),
    updateCheatsheetMarkdown: (...a: Parameters<typeof actual.updateCheatsheetMarkdown>) =>
      updateCheatsheetMarkdown(...a),
  };
});

const fakeDb = {} as unknown as LearnProDb;

function fakeLlm(responseText: string): LLMProvider & { calls: CompleteRequest[] } {
  const calls: CompleteRequest[] = [];
  return {
    name: "fake",
    calls,
    async complete(req: CompleteRequest): Promise<CompleteResponse> {
      calls.push(req);
      return {
        text: responseText,
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
  async () => ({ user_id, org_id: "self", email: `${user_id}@x.y`, is_admin: false });

const NULL_SESSION: SessionResolver = async () => null;

function fakeFetcher(
  episodes: ReadonlyArray<{
    problem_slug: string;
    problem_name: string;
    language: "python" | "typescript";
    difficulty: string;
    concept_tags: ReadonlyArray<string>;
    final_outcome: string | null;
    hints_used: number;
    user_code_excerpt?: string | null;
    problem_statement: string;
  }>,
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

function buildApp(opts: {
  sessionResolver?: SessionResolver;
  llm?: LLMProvider;
  episodeFetcher?: CheatsheetEpisodeFetcher;
  withCheatsheetSurface?: boolean;
}) {
  const cheatsheetEpisodeFetcher = opts.episodeFetcher ?? fakeFetcher([sampleEpisodeInput()]);
  const surfaceWired = opts.withCheatsheetSurface !== false;
  return buildServer({
    sessionResolver: opts.sessionResolver ?? NULL_SESSION,
    ...(opts.llm ? { llm: opts.llm } : {}),
    ...(surfaceWired
      ? {
          cheatsheetDb: fakeDb,
          cheatsheetEpisodeFetcher,
        }
      : {}),
  });
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

function fakeView(
  overrides: Partial<{
    id: string;
    user_id: string;
    org_id: string;
    episodes_covered: string[];
    entries: typeof sampleEntries;
    markdown_content: string;
    created_at: Date;
    updated_at: Date;
  }> = {},
) {
  return {
    id: CHEATSHEET_ID,
    user_id: USER_ID,
    org_id: "self",
    episodes_covered: [EPISODE_1, EPISODE_2].sort(),
    entries: sampleEntries,
    markdown_content: "# notes",
    created_at: new Date("2026-05-06T10:00:00Z"),
    updated_at: new Date("2026-05-06T10:00:00Z"),
    ...overrides,
  };
}

beforeEach(() => {
  createCheatsheet.mockReset();
  findCheatsheetForEpisodes.mockReset();
  getCheatsheetForUser.mockReset();
  listCheatsheetsForUser.mockReset();
  updateCheatsheetMarkdown.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /v1/cheatsheets (STORY-041)", () => {
  it("returns 401 when no session", async () => {
    const app = buildApp({});
    const res = await app.inject({ method: "GET", url: "/v1/cheatsheets" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("returns the user's cheatsheet history (most recent first)", async () => {
    listCheatsheetsForUser.mockResolvedValue([fakeView()]);
    const app = buildApp({ sessionResolver: userSession(USER_ID) });
    const res = await app.inject({ method: "GET", url: "/v1/cheatsheets" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].id).toBe(CHEATSHEET_ID);
    expect(body.items[0].entries).toHaveLength(1);
    expect(listCheatsheetsForUser).toHaveBeenCalledWith(fakeDb, { user_id: USER_ID });
    await app.close();
  });

  it("forwards limit + offset query params", async () => {
    listCheatsheetsForUser.mockResolvedValue([]);
    const app = buildApp({ sessionResolver: userSession(USER_ID) });
    const res = await app.inject({
      method: "GET",
      url: "/v1/cheatsheets?limit=5&offset=10",
    });
    expect(res.statusCode).toBe(200);
    expect(listCheatsheetsForUser).toHaveBeenCalledWith(fakeDb, {
      user_id: USER_ID,
      limit: 5,
      offset: 10,
    });
    await app.close();
  });

  it("returns 400 on invalid query params", async () => {
    const app = buildApp({ sessionResolver: userSession(USER_ID) });
    const res = await app.inject({ method: "GET", url: "/v1/cheatsheets?limit=abc" });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe("GET /v1/cheatsheets/:id (STORY-041)", () => {
  it("returns 401 when no session", async () => {
    const app = buildApp({});
    const res = await app.inject({
      method: "GET",
      url: `/v1/cheatsheets/${CHEATSHEET_ID}`,
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("returns 400 on non-uuid id", async () => {
    const app = buildApp({ sessionResolver: userSession(USER_ID) });
    const res = await app.inject({ method: "GET", url: "/v1/cheatsheets/not-a-uuid" });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("returns 404 when the cheatsheet doesn't belong to the user", async () => {
    getCheatsheetForUser.mockResolvedValue(null);
    const app = buildApp({ sessionResolver: userSession(USER_ID) });
    const res = await app.inject({
      method: "GET",
      url: `/v1/cheatsheets/${CHEATSHEET_ID}`,
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("returns the cheatsheet view", async () => {
    getCheatsheetForUser.mockResolvedValue(fakeView());
    const app = buildApp({ sessionResolver: userSession(USER_ID) });
    const res = await app.inject({
      method: "GET",
      url: `/v1/cheatsheets/${CHEATSHEET_ID}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.cheatsheet.id).toBe(CHEATSHEET_ID);
    expect(body.cheatsheet.entries).toHaveLength(1);
    expect(getCheatsheetForUser).toHaveBeenCalledWith(fakeDb, CHEATSHEET_ID, USER_ID);
    await app.close();
  });
});

describe("PUT /v1/cheatsheets/:id (STORY-041)", () => {
  it("returns 401 when no session", async () => {
    const app = buildApp({});
    const res = await app.inject({
      method: "PUT",
      url: `/v1/cheatsheets/${CHEATSHEET_ID}`,
      payload: { markdown_content: "x" },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("returns 400 on missing markdown_content", async () => {
    const app = buildApp({ sessionResolver: userSession(USER_ID) });
    const res = await app.inject({
      method: "PUT",
      url: `/v1/cheatsheets/${CHEATSHEET_ID}`,
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("returns 404 when the cheatsheet doesn't belong to the user", async () => {
    updateCheatsheetMarkdown.mockResolvedValue(null);
    const app = buildApp({ sessionResolver: userSession(USER_ID) });
    const res = await app.inject({
      method: "PUT",
      url: `/v1/cheatsheets/${CHEATSHEET_ID}`,
      payload: { markdown_content: "edited" },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("updates the markdown and returns the updated view", async () => {
    updateCheatsheetMarkdown.mockResolvedValue(fakeView({ markdown_content: "edited" }));
    const app = buildApp({ sessionResolver: userSession(USER_ID) });
    const res = await app.inject({
      method: "PUT",
      url: `/v1/cheatsheets/${CHEATSHEET_ID}`,
      payload: { markdown_content: "edited" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().cheatsheet.markdown_content).toBe("edited");
    expect(updateCheatsheetMarkdown).toHaveBeenCalledWith(fakeDb, {
      user_id: USER_ID,
      cheatsheet_id: CHEATSHEET_ID,
      markdown_content: "edited",
    });
    await app.close();
  });
});

describe("POST /v1/cheatsheets (STORY-041)", () => {
  it("returns 401 when no session", async () => {
    const app = buildApp({});
    const res = await app.inject({
      method: "POST",
      url: "/v1/cheatsheets",
      payload: { episode_ids: [EPISODE_1] },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("returns 400 on empty episode_ids", async () => {
    const app = buildApp({ sessionResolver: userSession(USER_ID) });
    const res = await app.inject({
      method: "POST",
      url: "/v1/cheatsheets",
      payload: { episode_ids: [] },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("idempotency: returns the existing cheatsheet (200, generated=false) if one matches", async () => {
    const existing = fakeView();
    findCheatsheetForEpisodes.mockResolvedValue(existing);
    const fetcher = fakeFetcher([sampleEpisodeInput()]);
    const llm = fakeLlm(JSON.stringify({ entries: sampleEntries }));
    const app = buildApp({
      sessionResolver: userSession(USER_ID),
      llm,
      episodeFetcher: fetcher,
    });
    const res = await app.inject({
      method: "POST",
      url: "/v1/cheatsheets",
      payload: { episode_ids: [EPISODE_2, EPISODE_1] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().generated).toBe(false);
    expect(llm.calls).toHaveLength(0);
    expect(fetcher.calls).toHaveLength(0);
    await app.close();
  });

  it("returns 400 when none of the supplied episode_ids belong to the user", async () => {
    findCheatsheetForEpisodes.mockResolvedValue(null);
    const fetcher = fakeFetcher([]);
    const app = buildApp({
      sessionResolver: userSession(USER_ID),
      episodeFetcher: fetcher,
    });
    const res = await app.inject({
      method: "POST",
      url: "/v1/cheatsheets",
      payload: { episode_ids: [EPISODE_1] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("no_episodes_for_user");
    await app.close();
  });

  it("happy path: generates a fresh cheatsheet and persists it (201, generated=true)", async () => {
    findCheatsheetForEpisodes.mockResolvedValue(null);
    const persisted = fakeView();
    createCheatsheet.mockResolvedValue(persisted);
    const fetcher = fakeFetcher([sampleEpisodeInput()]);
    const llm = fakeLlm(JSON.stringify({ entries: sampleEntries }));
    const app = buildApp({
      sessionResolver: userSession(USER_ID),
      llm,
      episodeFetcher: fetcher,
    });
    const res = await app.inject({
      method: "POST",
      url: "/v1/cheatsheets",
      payload: { episode_ids: [EPISODE_2, EPISODE_1] },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.generated).toBe(true);
    expect(body.cheatsheet.id).toBe(CHEATSHEET_ID);
    expect(llm.calls).toHaveLength(1);
    // Episode IDs are sorted before being passed to the fetcher / persistence helpers, so
    // idempotency lookups always see the canonical order.
    const sorted = [EPISODE_1, EPISODE_2].sort();
    expect(fetcher.calls[0]?.episode_ids).toEqual(sorted);
    expect(createCheatsheet).toHaveBeenCalledWith(
      fakeDb,
      expect.objectContaining({
        user_id: USER_ID,
        episodes_covered: sorted,
      }),
    );
    await app.close();
  });

  it("503 when the agent throws (LLM outage)", async () => {
    findCheatsheetForEpisodes.mockResolvedValue(null);
    const fetcher = fakeFetcher([sampleEpisodeInput()]);
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
      episodeFetcher: fetcher,
    });
    const res = await app.inject({
      method: "POST",
      url: "/v1/cheatsheets",
      payload: { episode_ids: [EPISODE_1] },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toBe("cheatsheet_unavailable");
    await app.close();
  });

  it("scopes by user_id: episode_ids stolen from another user fall through to 400", async () => {
    findCheatsheetForEpisodes.mockResolvedValue(null);
    const fetcher = fakeFetcher([]); // fetcher returns empty for episodes the user doesn't own
    const llm = fakeLlm(JSON.stringify({ entries: sampleEntries }));
    const app = buildApp({
      sessionResolver: userSession(OTHER_USER_ID),
      llm,
      episodeFetcher: fetcher,
    });
    const res = await app.inject({
      method: "POST",
      url: "/v1/cheatsheets",
      payload: { episode_ids: [EPISODE_1, EPISODE_2] },
    });
    expect(res.statusCode).toBe(400);
    expect(fetcher.calls[0]?.user_id).toBe(OTHER_USER_ID);
    await app.close();
  });
});

describe("POST /v1/cheatsheets/:id/export (STORY-041)", () => {
  it("returns 401 when no session", async () => {
    const app = buildApp({});
    const res = await app.inject({
      method: "POST",
      url: `/v1/cheatsheets/${CHEATSHEET_ID}/export`,
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("returns 404 when the cheatsheet doesn't belong to the user", async () => {
    getCheatsheetForUser.mockResolvedValue(null);
    const app = buildApp({ sessionResolver: userSession(USER_ID) });
    const res = await app.inject({
      method: "POST",
      url: `/v1/cheatsheets/${CHEATSHEET_ID}/export`,
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("returns the markdown content with a sensible Content-Disposition header", async () => {
    getCheatsheetForUser.mockResolvedValue(fakeView({ markdown_content: "# my notes" }));
    const app = buildApp({ sessionResolver: userSession(USER_ID) });
    const res = await app.inject({
      method: "POST",
      url: `/v1/cheatsheets/${CHEATSHEET_ID}/export`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/markdown/);
    expect(res.headers["content-disposition"]).toContain(`learnpro-cheatsheet-${CHEATSHEET_ID}.md`);
    expect(res.body).toBe("# my notes");
    await app.close();
  });
});

describe("Cheatsheet routes wiring (STORY-041)", () => {
  it("routes 404 when cheatsheetDb / fetcher are NOT supplied (graceful degrade)", async () => {
    const app = buildApp({
      sessionResolver: userSession(USER_ID),
      withCheatsheetSurface: false,
    });
    const res = await app.inject({ method: "GET", url: "/v1/cheatsheets" });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
