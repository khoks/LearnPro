import {
  TokenBudgetExceededError,
  type CompleteRequest,
  type CompleteResponse,
  type EmbedRequest,
  type EmbedResponse,
  type LLMProvider,
  type StreamChunk,
  type ToolCallRequest,
  type ToolCallResponse,
} from "@learnpro/llm";
import type { ProfileFieldUpdates } from "@learnpro/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "./index.js";
import {
  approximateTokenCount,
  deterministicFallbackTurn,
  type OnboardingProfileWriter,
} from "./onboarding.js";
import type { SessionResolver } from "./session.js";

const userSession =
  (user_id: string): SessionResolver =>
  async () => ({
    user_id,
    org_id: "self",
    email: `${user_id}@learnpro.local`,
  });

class FakeLLMProvider implements LLMProvider {
  readonly name = "fake-onboarding-llm";
  public lastRequest: CompleteRequest | null = null;
  public failWith: Error | null = null;

  constructor(private readonly responseText: string | (() => string)) {}

  async complete(req: CompleteRequest): Promise<CompleteResponse> {
    this.lastRequest = req;
    if (this.failWith) throw this.failWith;
    return {
      text: typeof this.responseText === "function" ? this.responseText() : this.responseText,
      model: req.model ?? "fake-model",
      finish_reason: "end_turn",
      usage: { input_tokens: 50, output_tokens: 30 },
    };
  }

  async *stream(_req: CompleteRequest): AsyncIterable<StreamChunk> {
    yield { delta: "", done: true };
  }

  async embed(_req: EmbedRequest): Promise<EmbedResponse> {
    return { vector: [], model: "fake", usage: {} };
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

interface ProfileWriteCall {
  user_id: string;
  updates: ProfileFieldUpdates;
}

function makeProfileWriter(): {
  writer: OnboardingProfileWriter;
  calls: ProfileWriteCall[];
  failNext: () => void;
} {
  const calls: ProfileWriteCall[] = [];
  let shouldFail = false;
  const writer: OnboardingProfileWriter = async (user_id, updates) => {
    if (shouldFail) {
      shouldFail = false;
      throw new Error("simulated DB outage");
    }
    calls.push({ user_id, updates });
  };
  return {
    writer,
    calls,
    failNext: () => {
      shouldFail = true;
    },
  };
}

const USER_ID = "11111111-1111-1111-1111-111111111111";

describe("POST /v1/onboarding/turn (STORY-053)", () => {
  beforeEach(() => {
    delete process.env["LEARNPRO_DISABLE_ONBOARDING_LLM"];
  });

  afterEach(() => {
    delete process.env["LEARNPRO_DISABLE_ONBOARDING_LLM"];
  });

  it("returns 401 when no session", async () => {
    const llm = new FakeLLMProvider('{"assistant_message":"hi","captured":{},"done":false}');
    const app = buildServer({ llm });
    const res = await app.inject({
      method: "POST",
      url: "/v1/onboarding/turn",
      payload: {
        messages: [{ role: "user", content: "hi" }],
      },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "unauthorized" });
    await app.close();
  });

  it("returns 400 on malformed body", async () => {
    const llm = new FakeLLMProvider('{"assistant_message":"hi","captured":{},"done":false}');
    const app = buildServer({ llm, sessionResolver: userSession(USER_ID) });
    const res = await app.inject({
      method: "POST",
      url: "/v1/onboarding/turn",
      payload: { messages: [] },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("happy path: LLM returns valid JSON; route returns it; profile writer receives the captures", async () => {
    const responseJson = JSON.stringify({
      assistant_message: "Got it — backend SWE intern. How much time per day?",
      captured: {
        target_role: "backend_swe_intern",
        primary_goal: "land a backend SWE internship this summer",
      },
      done: false,
    });
    const llm = new FakeLLMProvider(responseJson);
    const writer = makeProfileWriter();
    const app = buildServer({
      llm,
      sessionResolver: userSession(USER_ID),
      onboardingProfileWriter: writer.writer,
    });

    const res = await app.inject({
      method: "POST",
      url: "/v1/onboarding/turn",
      payload: {
        messages: [
          { role: "assistant", content: "Hi! What role are you preparing for?" },
          {
            role: "user",
            content: "I want to land a backend SWE internship this summer.",
          },
        ],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      assistant_message: string;
      captured: ProfileFieldUpdates;
      done: boolean;
    };
    expect(body.captured.target_role).toBe("backend_swe_intern");
    expect(body.done).toBe(false);
    expect(writer.calls).toHaveLength(1);
    expect(writer.calls[0]?.user_id).toBe(USER_ID);
    expect(writer.calls[0]?.updates.target_role).toBe("backend_swe_intern");
    expect(llm.lastRequest?.model).toBe("claude-haiku-4-5-20251001");
    expect(llm.lastRequest?.user_id).toBe(USER_ID);
    expect(llm.lastRequest?.prompt_version).toBe("onboarding-2026-04-28");
    await app.close();
  });

  it("strips a markdown ```json fence around the LLM response", async () => {
    const responseJson =
      "```json\n" +
      JSON.stringify({
        assistant_message: "Sounds good. How much time daily?",
        captured: { target_role: "ml_engineer" },
        done: false,
      }) +
      "\n```";
    const llm = new FakeLLMProvider(responseJson);
    const writer = makeProfileWriter();
    const app = buildServer({
      llm,
      sessionResolver: userSession(USER_ID),
      onboardingProfileWriter: writer.writer,
    });
    const res = await app.inject({
      method: "POST",
      url: "/v1/onboarding/turn",
      payload: {
        messages: [{ role: "user", content: "ML engineer" }],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { captured: ProfileFieldUpdates };
    expect(body.captured.target_role).toBe("ml_engineer");
    await app.close();
  });

  it("parse-failure path: LLM returns plain text — server returns a fallback follow-up question, done=false", async () => {
    const llm = new FakeLLMProvider("Yeah cool — what role are you targeting?");
    const writer = makeProfileWriter();
    const app = buildServer({
      llm,
      sessionResolver: userSession(USER_ID),
      onboardingProfileWriter: writer.writer,
    });
    const res = await app.inject({
      method: "POST",
      url: "/v1/onboarding/turn",
      payload: {
        messages: [{ role: "user", content: "Hello!" }],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      assistant_message: string;
      captured: ProfileFieldUpdates;
      done: boolean;
    };
    expect(body.assistant_message.length).toBeGreaterThan(0);
    expect(body.captured).toEqual({});
    expect(body.done).toBe(false);
    expect(writer.calls).toHaveLength(0);
    await app.close();
  });

  it("turn-cap path: 7th assistant turn → done=true, friendly close-out", async () => {
    const llm = new FakeLLMProvider('{"assistant_message":"x","captured":{},"done":false}');
    const app = buildServer({
      llm,
      sessionResolver: userSession(USER_ID),
    });
    const messages = [
      ...Array.from({ length: 6 }, (_, i) => ({
        role: "assistant" as const,
        content: `assistant turn ${i + 1}`,
      })),
      { role: "user" as const, content: "still chatting" },
    ];
    const res = await app.inject({
      method: "POST",
      url: "/v1/onboarding/turn",
      payload: { messages },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { done: boolean; assistant_message: string };
    expect(body.done).toBe(true);
    expect(body.assistant_message.toLowerCase()).toContain("dashboard");
    expect(llm.lastRequest).toBeNull(); // LLM was not called past the cap
    await app.close();
  });

  it("token-cap path: oversized conversation → done=true without LLM call", async () => {
    const llm = new FakeLLMProvider('{"assistant_message":"x","captured":{},"done":false}');
    const app = buildServer({ llm, sessionResolver: userSession(USER_ID) });
    const huge = "x".repeat(20000); // ~5000 tokens worth
    const res = await app.inject({
      method: "POST",
      url: "/v1/onboarding/turn",
      payload: {
        messages: [{ role: "user", content: huge }],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { done: boolean };
    expect(body.done).toBe(true);
    expect(llm.lastRequest).toBeNull();
    await app.close();
  });

  it("fallback-deterministic path: LEARNPRO_DISABLE_ONBOARDING_LLM=1 yields the 3-question form-equivalent flow", async () => {
    process.env["LEARNPRO_DISABLE_ONBOARDING_LLM"] = "1";
    const llm = new FakeLLMProvider("should not be called");
    const writer = makeProfileWriter();
    const app = buildServer({
      llm,
      sessionResolver: userSession(USER_ID),
      onboardingProfileWriter: writer.writer,
    });

    // Turn 1: assistant greets, user replies with target role.
    const turn1 = await app.inject({
      method: "POST",
      url: "/v1/onboarding/turn",
      payload: {
        messages: [
          { role: "assistant", content: "Welcome!" },
          { role: "user", content: "Backend SWE intern" },
        ],
      },
    });
    expect(turn1.statusCode).toBe(200);
    const body1 = turn1.json() as {
      assistant_message: string;
      captured: ProfileFieldUpdates;
      done: boolean;
    };
    expect(body1.captured.target_role).toBe("Backend SWE intern");
    expect(body1.done).toBe(false);
    expect(body1.assistant_message.toLowerCase()).toContain("minutes");

    // Turn 2: user replies with time budget.
    const turn2 = await app.inject({
      method: "POST",
      url: "/v1/onboarding/turn",
      payload: {
        messages: [
          { role: "assistant", content: "Welcome!" },
          { role: "user", content: "Backend SWE intern" },
          { role: "assistant", content: body1.assistant_message },
          { role: "user", content: "30" },
        ],
      },
    });
    const body2 = turn2.json() as { captured: ProfileFieldUpdates; done: boolean };
    expect(body2.captured.time_budget_min).toBe(30);
    expect(body2.done).toBe(false);

    // Turn 3: user replies with primary_goal → done=true close-out.
    const turn3 = await app.inject({
      method: "POST",
      url: "/v1/onboarding/turn",
      payload: {
        messages: [
          { role: "assistant", content: "Welcome!" },
          { role: "user", content: "Backend SWE intern" },
          { role: "assistant", content: body1.assistant_message },
          { role: "user", content: "30" },
          { role: "assistant", content: "next" },
          { role: "user", content: "I want to land an internship this summer" },
        ],
      },
    });
    const body3 = turn3.json() as { captured: ProfileFieldUpdates; done: boolean };
    expect(body3.captured.primary_goal).toContain("internship");
    expect(body3.done).toBe(true);

    // Profile writer received all three captured updates across the flow.
    expect(writer.calls).toHaveLength(3);
    expect(llm.lastRequest).toBeNull();
    await app.close();
  });

  it("fallback-deterministic path: user 'I'd rather start now' → graceful exit even at turn 1", async () => {
    process.env["LEARNPRO_DISABLE_ONBOARDING_LLM"] = "1";
    const llm = new FakeLLMProvider("nope");
    const app = buildServer({ llm, sessionResolver: userSession(USER_ID) });
    const res = await app.inject({
      method: "POST",
      url: "/v1/onboarding/turn",
      payload: {
        messages: [
          { role: "assistant", content: "Welcome!" },
          { role: "user", content: "I'd rather start now." },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { done: boolean };
    expect(body.done).toBe(true);
    await app.close();
  });

  it("token-budget path: TokenBudgetExceededError from LLM → 429 (global error handler maps it)", async () => {
    const llm = new FakeLLMProvider("ignored");
    llm.failWith = new TokenBudgetExceededError(USER_ID, 1200, 1000);
    const app = buildServer({ llm, sessionResolver: userSession(USER_ID) });
    const res = await app.inject({
      method: "POST",
      url: "/v1/onboarding/turn",
      payload: {
        messages: [{ role: "user", content: "hi" }],
      },
    });
    expect(res.statusCode).toBe(429);
    const body = res.json() as { error: string; message: string };
    expect(body.error).toBe("daily_budget_exceeded");
    expect(body.message).toContain("1200/1000");
    await app.close();
  });

  it("LLM transport failure → 503 onboarding_unavailable (not 500)", async () => {
    const llm = new FakeLLMProvider("ignored");
    llm.failWith = new Error("ECONNRESET");
    const app = buildServer({ llm, sessionResolver: userSession(USER_ID) });
    const res = await app.inject({
      method: "POST",
      url: "/v1/onboarding/turn",
      payload: {
        messages: [{ role: "user", content: "hi" }],
      },
    });
    expect(res.statusCode).toBe(503);
    const body = res.json() as { error: string };
    expect(body.error).toBe("onboarding_unavailable");
    await app.close();
  });

  it("profile writer throwing does NOT break the user-facing turn — the response still goes back", async () => {
    const responseJson = JSON.stringify({
      assistant_message: "got it",
      captured: { target_role: "ml_engineer" },
      done: false,
    });
    const llm = new FakeLLMProvider(responseJson);
    const writer = makeProfileWriter();
    writer.failNext();
    const app = buildServer({
      llm,
      sessionResolver: userSession(USER_ID),
      onboardingProfileWriter: writer.writer,
    });
    const res = await app.inject({
      method: "POST",
      url: "/v1/onboarding/turn",
      payload: {
        messages: [{ role: "user", content: "ML engineer" }],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { captured: ProfileFieldUpdates };
    expect(body.captured.target_role).toBe("ml_engineer");
    await app.close();
  });
});

describe("approximateTokenCount", () => {
  it("treats 4 chars as ~1 token", () => {
    expect(approximateTokenCount([{ role: "user", content: "abcd" }])).toBe(1);
    expect(approximateTokenCount([{ role: "user", content: "12345678" }])).toBe(2);
  });

  it("sums across both roles in the conversation", () => {
    expect(
      approximateTokenCount([
        { role: "assistant", content: "abcd" },
        { role: "user", content: "abcd" },
      ]),
    ).toBe(2);
  });
});

describe("deterministicFallbackTurn", () => {
  it("first turn: asks for target_role, captures nothing yet", () => {
    const r = deterministicFallbackTurn([{ role: "assistant", content: "Welcome!" }]);
    expect(r.assistant_message.toLowerCase()).toContain("role");
    expect(r.captured).toEqual({});
  });

  it("second turn: captures target_role, asks for time_budget_min", () => {
    const r = deterministicFallbackTurn([
      { role: "assistant", content: "Welcome!" },
      { role: "user", content: "ML engineer" },
    ]);
    expect(r.captured.target_role).toBe("ML engineer");
    expect(r.assistant_message.toLowerCase()).toContain("minutes");
    expect(r.done).toBe(false);
  });

  it("third turn: captures time_budget_min from a numeric user reply", () => {
    const r = deterministicFallbackTurn([
      { role: "assistant", content: "Welcome!" },
      { role: "user", content: "ML engineer" },
      { role: "assistant", content: "How many minutes?" },
      { role: "user", content: "45" },
    ]);
    expect(r.captured.time_budget_min).toBe(45);
  });

  it("does not capture an out-of-range time_budget_min", () => {
    const r = deterministicFallbackTurn([
      { role: "assistant", content: "Welcome!" },
      { role: "user", content: "ML engineer" },
      { role: "assistant", content: "How many minutes?" },
      { role: "user", content: "9999999" },
    ]);
    expect(r.captured.time_budget_min).toBeUndefined();
  });

  it("user 'skip' at any point → done=true, captured={}", () => {
    const r = deterministicFallbackTurn([
      { role: "assistant", content: "Welcome!" },
      { role: "user", content: "skip" },
    ]);
    expect(r.done).toBe(true);
    expect(r.captured).toEqual({});
  });

  it("user 'I'll do this later' → done=true", () => {
    const r = deterministicFallbackTurn([
      { role: "assistant", content: "Welcome!" },
      { role: "user", content: "I'll do this later" },
    ]);
    expect(r.done).toBe(true);
  });
});
