import { describe, expect, it } from "vitest";
import { BudgetGatedLLMProvider } from "./budget-gated-provider.js";
import { DailyTokenBudget, InMemoryUsageStore } from "./budget.js";
import { ANTHROPIC_HAIKU, ANTHROPIC_OPUS } from "./models.js";
import { ANTHROPIC_SONNET } from "./pricing.js";
import { TokenBudgetExceededError } from "./errors.js";
import type { LLMProvider } from "./provider.js";
import type {
  CompleteRequest,
  CompleteResponse,
  EmbedRequest,
  EmbedResponse,
  StreamChunk,
  ToolCallRequest,
  ToolCallResponse,
} from "./types.js";

class StubProvider implements LLMProvider {
  readonly name = "stub";
  public lastCompleteReq: CompleteRequest | null = null;
  public lastToolCallReq: ToolCallRequest | null = null;
  public lastStreamReq: CompleteRequest | null = null;
  public lastEmbedReq: EmbedRequest | null = null;

  constructor(
    private readonly response: {
      input_tokens: number;
      output_tokens: number;
      streamChunks?: string[];
    },
  ) {}

  async complete(req: CompleteRequest): Promise<CompleteResponse> {
    this.lastCompleteReq = req;
    return {
      text: "stub-text",
      model: req.model ?? "stub-model",
      finish_reason: "end_turn",
      usage: {
        input_tokens: this.response.input_tokens,
        output_tokens: this.response.output_tokens,
      },
    };
  }

  async *stream(req: CompleteRequest): AsyncIterable<StreamChunk> {
    this.lastStreamReq = req;
    const chunks = this.response.streamChunks ?? ["abcd", "efgh"];
    for (const c of chunks) yield { delta: c, done: false };
    yield { delta: "", done: true };
  }

  async embed(req: EmbedRequest): Promise<EmbedResponse> {
    this.lastEmbedReq = req;
    return { vector: [0.1, 0.2], model: "stub-embed", usage: {} };
  }

  async toolCall(req: ToolCallRequest): Promise<ToolCallResponse> {
    this.lastToolCallReq = req;
    return {
      text: "",
      tool_calls: [],
      model: req.model ?? "stub-model",
      finish_reason: "tool_use",
      usage: {
        input_tokens: this.response.input_tokens,
        output_tokens: this.response.output_tokens,
      },
    };
  }
}

describe("BudgetGatedLLMProvider.complete", () => {
  it("passes the resolved baseline model through under threshold", async () => {
    const inner = new StubProvider({ input_tokens: 100, output_tokens: 50 });
    const budget = new DailyTokenBudget({
      store: new InMemoryUsageStore(),
      daily_limit_tokens: 10_000,
    });
    const gated = new BudgetGatedLLMProvider({ inner, budget });
    const res = await gated.complete({
      messages: [{ role: "user", content: "hi" }],
      role: "tutor",
      user_id: "u1",
      max_tokens: 64,
      temperature: 0.5,
    });
    expect(inner.lastCompleteReq?.model).toBe(ANTHROPIC_OPUS);
    expect(res.text).toBe("stub-text");
  });

  it("downgrades the model when over the threshold (Opus → Sonnet)", async () => {
    const store = new InMemoryUsageStore();
    const budget = new DailyTokenBudget({ store, daily_limit_tokens: 1000 });
    await budget.record("u1", 800);
    const inner = new StubProvider({ input_tokens: 10, output_tokens: 5 });
    const gated = new BudgetGatedLLMProvider({ inner, budget });
    await gated.complete({
      messages: [{ role: "user", content: "hi" }],
      role: "tutor",
      user_id: "u1",
      max_tokens: 32,
      temperature: 0,
    });
    expect(inner.lastCompleteReq?.model).toBe(ANTHROPIC_SONNET);
  });

  it("respects an explicit model override (no downgrade)", async () => {
    const store = new InMemoryUsageStore();
    const budget = new DailyTokenBudget({ store, daily_limit_tokens: 1000 });
    await budget.record("u1", 999);
    const inner = new StubProvider({ input_tokens: 10, output_tokens: 5 });
    const gated = new BudgetGatedLLMProvider({ inner, budget });
    await gated.complete({
      messages: [{ role: "user", content: "hi" }],
      role: "tutor",
      model: "explicit-model",
      user_id: "u1",
      max_tokens: 32,
      temperature: 0,
    });
    expect(inner.lastCompleteReq?.model).toBe("explicit-model");
  });

  it("throws TokenBudgetExceededError before calling the inner provider when at the limit", async () => {
    const store = new InMemoryUsageStore();
    const budget = new DailyTokenBudget({ store, daily_limit_tokens: 1000 });
    await budget.record("u1", 1000);
    const inner = new StubProvider({ input_tokens: 1, output_tokens: 1 });
    const gated = new BudgetGatedLLMProvider({ inner, budget });
    await expect(
      gated.complete({
        messages: [{ role: "user", content: "hi" }],
        role: "tutor",
        user_id: "u1",
        max_tokens: 16,
        temperature: 0,
      }),
    ).rejects.toBeInstanceOf(TokenBudgetExceededError);
    expect(inner.lastCompleteReq).toBeNull();
  });

  it("records (input + output) tokens after a successful call", async () => {
    const store = new InMemoryUsageStore();
    const budget = new DailyTokenBudget({ store, daily_limit_tokens: 10_000 });
    const inner = new StubProvider({ input_tokens: 120, output_tokens: 35 });
    const gated = new BudgetGatedLLMProvider({ inner, budget });
    await gated.complete({
      messages: [{ role: "user", content: "hi" }],
      role: "tutor",
      user_id: "u1",
      max_tokens: 16,
      temperature: 0,
    });
    expect(await store.today("u1")).toBe(155);
  });

  it("does nothing budget-wise when no user_id is provided (system call)", async () => {
    const store = new InMemoryUsageStore();
    const budget = new DailyTokenBudget({ store, daily_limit_tokens: 1000 });
    const inner = new StubProvider({ input_tokens: 50, output_tokens: 50 });
    const gated = new BudgetGatedLLMProvider({ inner, budget });
    await gated.complete({
      messages: [{ role: "user", content: "hi" }],
      role: "tutor",
      max_tokens: 16,
      temperature: 0,
    });
    expect(await store.today("u1")).toBe(0);
    expect(inner.lastCompleteReq?.model).toBe(ANTHROPIC_OPUS);
  });
});

describe("BudgetGatedLLMProvider.stream", () => {
  it("downgrades the model when over the threshold and approximates output tokens", async () => {
    const store = new InMemoryUsageStore();
    const budget = new DailyTokenBudget({ store, daily_limit_tokens: 1000 });
    await budget.record("u1", 850);
    const inner = new StubProvider({
      input_tokens: 0,
      output_tokens: 0,
      streamChunks: ["abcd", "efghij"], // 4 + 6 = 10 chars → ~3 tokens
    });
    const gated = new BudgetGatedLLMProvider({ inner, budget });
    const out = [];
    for await (const c of gated.stream({
      messages: [{ role: "user", content: "hi" }],
      role: "tutor",
      user_id: "u1",
      max_tokens: 16,
      temperature: 0,
    })) {
      out.push(c);
    }
    expect(inner.lastStreamReq?.model).toBe(ANTHROPIC_SONNET);
    expect(out[out.length - 1]?.done).toBe(true);
    // 850 (existing) + ceil(4/4)=1 + ceil(6/4)=2 = 853
    expect(await store.today("u1")).toBe(853);
  });

  it("blocks when over budget without consuming the inner stream", async () => {
    const store = new InMemoryUsageStore();
    const budget = new DailyTokenBudget({ store, daily_limit_tokens: 1000 });
    await budget.record("u1", 1000);
    const inner = new StubProvider({ input_tokens: 0, output_tokens: 0 });
    const gated = new BudgetGatedLLMProvider({ inner, budget });
    await expect(async () => {
      for await (const _ of gated.stream({
        messages: [{ role: "user", content: "hi" }],
        role: "tutor",
        user_id: "u1",
        max_tokens: 16,
        temperature: 0,
      })) {
        // unreachable
      }
    }).rejects.toBeInstanceOf(TokenBudgetExceededError);
    expect(inner.lastStreamReq).toBeNull();
  });
});

describe("BudgetGatedLLMProvider.toolCall", () => {
  it("downgrades and records like complete()", async () => {
    const store = new InMemoryUsageStore();
    const budget = new DailyTokenBudget({ store, daily_limit_tokens: 1000 });
    await budget.record("u1", 800);
    const inner = new StubProvider({ input_tokens: 30, output_tokens: 20 });
    const gated = new BudgetGatedLLMProvider({ inner, budget });
    await gated.toolCall({
      messages: [{ role: "user", content: "hi" }],
      role: "tutor",
      user_id: "u1",
      max_tokens: 16,
      temperature: 0,
      tools: [{ name: "t", description: "d", input_schema: { type: "object" } }],
      tool_choice: "auto",
    });
    expect(inner.lastToolCallReq?.model).toBe(ANTHROPIC_SONNET);
    expect(await store.today("u1")).toBe(850);
  });
});

describe("BudgetGatedLLMProvider.embed", () => {
  it("passes through without budget gating", async () => {
    const store = new InMemoryUsageStore();
    const budget = new DailyTokenBudget({ store, daily_limit_tokens: 1000 });
    await budget.record("u1", 999_999);
    const inner = new StubProvider({ input_tokens: 0, output_tokens: 0 });
    const gated = new BudgetGatedLLMProvider({ inner, budget });
    const res = await gated.embed({ text: "hello" });
    expect(res.vector).toEqual([0.1, 0.2]);
    expect(inner.lastEmbedReq?.text).toBe("hello");
  });
});

describe("BudgetGatedLLMProvider.name", () => {
  it("identifies itself with a budget-gated prefix", () => {
    const inner = new StubProvider({ input_tokens: 0, output_tokens: 0 });
    const budget = new DailyTokenBudget({
      store: new InMemoryUsageStore(),
      daily_limit_tokens: 0,
    });
    const gated = new BudgetGatedLLMProvider({ inner, budget });
    expect(gated.name).toBe("budget-gated:stub");
  });
});

// Sanity: ensure tier ladder uses Sonnet from pricing module (not duplicated).
describe("Tier sanity", () => {
  it("Sonnet baseline downgrades to Haiku", async () => {
    const store = new InMemoryUsageStore();
    const budget = new DailyTokenBudget({
      store,
      daily_limit_tokens: 1000,
      models: {
        tutor: ANTHROPIC_SONNET,
        interviewer: ANTHROPIC_SONNET,
        reflection: ANTHROPIC_SONNET,
        grader: ANTHROPIC_HAIKU,
        router: ANTHROPIC_HAIKU,
      },
    });
    await budget.record("u1", 900);
    const inner = new StubProvider({ input_tokens: 0, output_tokens: 0 });
    const gated = new BudgetGatedLLMProvider({ inner, budget });
    await gated.complete({
      messages: [{ role: "user", content: "hi" }],
      role: "tutor",
      user_id: "u1",
      max_tokens: 16,
      temperature: 0,
    });
    expect(inner.lastCompleteReq?.model).toBe(ANTHROPIC_HAIKU);
  });
});
