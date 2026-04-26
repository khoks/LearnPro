import { describe, expect, it } from "vitest";
import {
  AnthropicProvider,
  type AnthropicMessageResponse,
  type AnthropicStreamEvent,
  type AnthropicTransport,
} from "./anthropic.js";
import { InMemoryLLMTelemetrySink } from "./telemetry.js";
import { ANTHROPIC_HAIKU, ANTHROPIC_OPUS } from "./models.js";
import { LLMRequestError, NotImplementedError } from "./errors.js";

class FakeTransport implements AnthropicTransport {
  public lastParams: Parameters<AnthropicTransport["createMessage"]>[0] | null = null;
  public createCalls = 0;

  constructor(
    private readonly response: AnthropicMessageResponse | (() => AnthropicMessageResponse),
  ) {}

  async createMessage(params: Parameters<AnthropicTransport["createMessage"]>[0]) {
    this.lastParams = params;
    this.createCalls++;
    return typeof this.response === "function" ? this.response() : this.response;
  }

  async *streamMessage(params: Parameters<AnthropicTransport["streamMessage"]>[0]) {
    this.lastParams = params;
    const events: AnthropicStreamEvent[] = [
      { type: "content_block_delta", delta: { type: "text_delta", text: "Hel" } },
      { type: "content_block_delta", delta: { type: "text_delta", text: "lo" } },
      { type: "message_stop" },
    ];
    for (const e of events) yield e;
  }
}

const baseResponse: AnthropicMessageResponse = {
  model: ANTHROPIC_HAIKU,
  stop_reason: "end_turn",
  usage: { input_tokens: 11, output_tokens: 7 },
  content: [{ type: "text", text: "Hello there." }],
};

describe("AnthropicProvider.complete", () => {
  it("routes by role: tutor → Opus", async () => {
    const transport = new FakeTransport({ ...baseResponse, model: ANTHROPIC_OPUS });
    const provider = new AnthropicProvider({ transport });
    await provider.complete({
      messages: [{ role: "user", content: "hi" }],
      role: "tutor",
      max_tokens: 64,
      temperature: 0.5,
    });
    expect(transport.lastParams?.model).toBe(ANTHROPIC_OPUS);
  });

  it("routes by role: grader → Haiku", async () => {
    const transport = new FakeTransport(baseResponse);
    const provider = new AnthropicProvider({ transport });
    await provider.complete({
      messages: [{ role: "user", content: "hi" }],
      role: "grader",
      max_tokens: 64,
      temperature: 0,
    });
    expect(transport.lastParams?.model).toBe(ANTHROPIC_HAIKU);
  });

  it("explicit model overrides role mapping", async () => {
    const transport = new FakeTransport({ ...baseResponse, model: "custom-model" });
    const provider = new AnthropicProvider({ transport });
    await provider.complete({
      messages: [{ role: "user", content: "hi" }],
      role: "tutor",
      model: "custom-model",
      max_tokens: 32,
      temperature: 0,
    });
    expect(transport.lastParams?.model).toBe("custom-model");
  });

  it("returns the joined text and usage from the response", async () => {
    const transport = new FakeTransport({
      ...baseResponse,
      content: [
        { type: "text", text: "Part A. " },
        { type: "text", text: "Part B." },
      ],
    });
    const provider = new AnthropicProvider({ transport });
    const res = await provider.complete({
      messages: [{ role: "user", content: "hi" }],
      max_tokens: 64,
      temperature: 0,
    });
    expect(res.text).toBe("Part A. Part B.");
    expect(res.finish_reason).toBe("end_turn");
    expect(res.usage.input_tokens).toBe(11);
    expect(res.usage.output_tokens).toBe(7);
  });

  it("retries transient errors and ultimately succeeds", async () => {
    let attempts = 0;
    const flaky: AnthropicTransport = {
      async createMessage(_params) {
        attempts++;
        if (attempts < 2) {
          const err = new Error("Service Unavailable") as Error & { status: number };
          err.status = 503;
          throw err;
        }
        return baseResponse;
      },
      async *streamMessage() {},
    };
    const provider = new AnthropicProvider({
      transport: flaky,
      retry: { attempts: 3, base_ms: 1, max_ms: 1, sleep: async () => {} },
    });
    const res = await provider.complete({
      messages: [{ role: "user", content: "hi" }],
      max_tokens: 16,
      temperature: 0,
    });
    expect(attempts).toBe(2);
    expect(res.text).toBe("Hello there.");
  });

  it("wraps fatal errors as LLMRequestError", async () => {
    const broken: AnthropicTransport = {
      async createMessage() {
        const err = new Error("Bad Request") as Error & { status: number };
        err.status = 400;
        throw err;
      },
      async *streamMessage() {},
    };
    const provider = new AnthropicProvider({
      transport: broken,
      retry: { attempts: 1, base_ms: 1, max_ms: 1, sleep: async () => {} },
    });
    await expect(
      provider.complete({
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 16,
        temperature: 0,
      }),
    ).rejects.toBeInstanceOf(LLMRequestError);
  });

  it("emits telemetry on success including role and prompt_version", async () => {
    const sink = new InMemoryLLMTelemetrySink();
    const transport = new FakeTransport(baseResponse);
    const provider = new AnthropicProvider({ transport, telemetry: sink });
    await provider.complete({
      messages: [{ role: "user", content: "hi" }],
      role: "tutor",
      user_id: "u1",
      prompt_version: "tutor@v3",
      max_tokens: 16,
      temperature: 0,
    });
    expect(sink.events).toHaveLength(1);
    const ev = sink.events[0]!;
    expect(ev.task).toBe("complete");
    expect(ev.role).toBe("tutor");
    expect(ev.prompt_version).toBe("tutor@v3");
    expect(ev.user_id).toBe("u1");
    expect(ev.input_tokens).toBe(11);
    expect(ev.output_tokens).toBe(7);
    expect(ev.ok).toBe(true);
  });
});

describe("AnthropicProvider.stream", () => {
  it("yields text deltas then a done chunk", async () => {
    const transport = new FakeTransport(baseResponse);
    const provider = new AnthropicProvider({ transport });
    const chunks = [];
    for await (const chunk of provider.stream({
      messages: [{ role: "user", content: "hi" }],
      max_tokens: 16,
      temperature: 0,
    })) {
      chunks.push(chunk);
    }
    expect(chunks.map((c) => c.delta).join("")).toBe("Hello");
    expect(chunks[chunks.length - 1]?.done).toBe(true);
  });
});

describe("AnthropicProvider.toolCall", () => {
  it("returns parsed tool invocations", async () => {
    const transport = new FakeTransport({
      model: ANTHROPIC_OPUS,
      stop_reason: "tool_use",
      usage: { input_tokens: 12, output_tokens: 4 },
      content: [
        { type: "text", text: "Calling tool." },
        {
          type: "tool_use",
          id: "tool_01",
          name: "give-hint",
          input: { rung: 2, focus: "off-by-one" },
        },
      ],
    });
    const provider = new AnthropicProvider({ transport });
    const res = await provider.toolCall({
      messages: [{ role: "user", content: "stuck" }],
      role: "tutor",
      max_tokens: 64,
      temperature: 0.2,
      tools: [
        {
          name: "give-hint",
          description: "Surface a graduated hint",
          input_schema: { type: "object" },
        },
      ],
      tool_choice: "auto",
    });
    expect(res.tool_calls).toHaveLength(1);
    expect(res.tool_calls[0]?.name).toBe("give-hint");
    expect(res.tool_calls[0]?.input).toEqual({ rung: 2, focus: "off-by-one" });
    expect(res.finish_reason).toBe("tool_use");
    expect(transport.lastParams?.tool_choice).toEqual({ type: "auto" });
  });
});

describe("AnthropicProvider.embed", () => {
  it("throws NotImplementedError until embedding service lands", async () => {
    const transport = new FakeTransport(baseResponse);
    const provider = new AnthropicProvider({ transport });
    expect(() => provider.embed({ text: "hello" })).toThrow(NotImplementedError);
  });
});
