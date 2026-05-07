import { describe, expect, it, vi } from "vitest";
import { LLMRequestError } from "../errors.js";
import { InMemoryLLMTelemetrySink } from "../telemetry.js";
import {
  DEFAULT_OLLAMA_BASE_URL,
  DEFAULT_OLLAMA_MODEL,
  OllamaTransport,
  parseToolJson,
} from "./ollama.js";

// STORY-036 — OllamaTransport unit tests. Mock `fetch` returns canned Ollama responses; we
// assert the request shape (URL + body), the parsed CompleteResponse shape, telemetry
// (cost=0, pricing_version='local'), and error wrapping into LLMRequestError.

function jsonResponse(body: unknown, init: Partial<ResponseInit> = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function streamResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "content-type": "application/x-ndjson" },
  });
}

describe("OllamaTransport.complete", () => {
  it("posts to /api/chat at the default base URL with the user's messages and a system prompt", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        model: DEFAULT_OLLAMA_MODEL,
        message: { role: "assistant", content: "Hi there." },
        done: true,
        done_reason: "stop",
        prompt_eval_count: 10,
        eval_count: 4,
      }),
    );
    const transport = new OllamaTransport({ fetch: fetcher });
    const out = await transport.complete({
      messages: [{ role: "user", content: "hi" }],
      system: "You are a friendly tutor.",
      max_tokens: 64,
      temperature: 0.5,
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    const call = fetcher.mock.calls[0];
    expect(call?.[0]).toBe(`${DEFAULT_OLLAMA_BASE_URL}/api/chat`);
    const init = call?.[1];
    expect(init?.method).toBe("POST");
    const body = JSON.parse(String(init?.body));
    expect(body.model).toBe(DEFAULT_OLLAMA_MODEL);
    expect(body.stream).toBe(false);
    expect(body.messages).toEqual([
      { role: "system", content: "You are a friendly tutor." },
      { role: "user", content: "hi" },
    ]);
    expect(body.options).toEqual({ num_predict: 64, temperature: 0.5 });

    expect(out.text).toBe("Hi there.");
    expect(out.model).toBe(DEFAULT_OLLAMA_MODEL);
    expect(out.usage).toEqual({ input_tokens: 10, output_tokens: 4 });
    expect(out.finish_reason).toBe("end_turn");
  });

  it("uses the explicit `model` override when supplied", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        model: "qwen2.5-coder:14b-instruct",
        message: { role: "assistant", content: "ok" },
        done: true,
      }),
    );
    const transport = new OllamaTransport({ fetch: fetcher });
    const res = await transport.complete({
      messages: [{ role: "user", content: "ping" }],
      model: "qwen2.5-coder:14b-instruct",
      max_tokens: 16,
      temperature: 0,
    });
    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(body.model).toBe("qwen2.5-coder:14b-instruct");
    expect(res.model).toBe("qwen2.5-coder:14b-instruct");
  });

  it("respects a custom baseUrl + defaultModel", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        model: "tinyllama:1.1b",
        message: { role: "assistant", content: "ok" },
        done: true,
      }),
    );
    const transport = new OllamaTransport({
      fetch: fetcher,
      baseUrl: "http://192.168.1.42:11434",
      defaultModel: "tinyllama:1.1b",
    });
    await transport.complete({
      messages: [{ role: "user", content: "ping" }],
      max_tokens: 16,
      temperature: 0,
    });
    expect(fetcher.mock.calls[0]?.[0]).toBe("http://192.168.1.42:11434/api/chat");
    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(body.model).toBe("tinyllama:1.1b");
  });

  it("maps `done_reason: 'length'` to finish_reason: 'max_tokens'", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        model: DEFAULT_OLLAMA_MODEL,
        message: { role: "assistant", content: "truncated" },
        done: true,
        done_reason: "length",
      }),
    );
    const transport = new OllamaTransport({ fetch: fetcher });
    const res = await transport.complete({
      messages: [{ role: "user", content: "long" }],
      max_tokens: 4,
      temperature: 0,
    });
    expect(res.finish_reason).toBe("max_tokens");
  });

  it("emits zero-cost telemetry tagged pricing_version='local'", async () => {
    const sink = new InMemoryLLMTelemetrySink();
    const fetcher = vi.fn(async () =>
      jsonResponse({
        model: DEFAULT_OLLAMA_MODEL,
        message: { role: "assistant", content: "ok" },
        done: true,
        prompt_eval_count: 7,
        eval_count: 3,
      }),
    );
    const transport = new OllamaTransport({ fetch: fetcher, telemetry: sink });
    await transport.complete({
      messages: [{ role: "user", content: "hi" }],
      role: "tutor",
      user_id: "u-1",
      session_id: "s-1",
      max_tokens: 64,
      temperature: 0,
    });
    expect(sink.events).toHaveLength(1);
    const ev = sink.events[0]!;
    expect(ev.provider).toBe("ollama");
    expect(ev.cost_usd).toBe(0);
    expect(ev.pricing_version).toBe("local");
    expect(ev.input_tokens).toBe(7);
    expect(ev.output_tokens).toBe(3);
    expect(ev.user_id).toBe("u-1");
    expect(ev.session_id).toBe("s-1");
    expect(ev.role).toBe("tutor");
    expect(ev.ok).toBe(true);
  });

  it("wraps non-2xx responses in LLMRequestError", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({ error: "model not found" }, { status: 404 }),
    );
    const transport = new OllamaTransport({ fetch: fetcher });
    await expect(
      transport.complete({
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 16,
        temperature: 0,
      }),
    ).rejects.toBeInstanceOf(LLMRequestError);
  });

  it("wraps thrown fetch errors in LLMRequestError", async () => {
    const fetcher = vi.fn(async () => {
      throw new TypeError("ECONNREFUSED");
    });
    const transport = new OllamaTransport({ fetch: fetcher });
    await expect(
      transport.complete({
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 16,
        temperature: 0,
      }),
    ).rejects.toBeInstanceOf(LLMRequestError);
  });

  it("records ok=false telemetry on failure", async () => {
    const sink = new InMemoryLLMTelemetrySink();
    const fetcher = vi.fn(async () => {
      throw new TypeError("boom");
    });
    const transport = new OllamaTransport({ fetch: fetcher, telemetry: sink });
    await expect(
      transport.complete({
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 16,
        temperature: 0,
      }),
    ).rejects.toBeInstanceOf(LLMRequestError);
    expect(sink.events).toHaveLength(1);
    expect(sink.events[0]!.ok).toBe(false);
  });

  it("rejects payloads that don't match the Ollama response schema", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({ model: "x", message: { content: "missing role" } }),
    );
    const transport = new OllamaTransport({ fetch: fetcher });
    await expect(
      transport.complete({
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 16,
        temperature: 0,
      }),
    ).rejects.toBeInstanceOf(LLMRequestError);
  });
});

describe("OllamaTransport.stream", () => {
  it("decodes ndjson chunks into StreamChunk deltas", async () => {
    const chunks = [
      JSON.stringify({
        model: DEFAULT_OLLAMA_MODEL,
        message: { role: "assistant", content: "Hel" },
        done: false,
      }) + "\n",
      JSON.stringify({
        model: DEFAULT_OLLAMA_MODEL,
        message: { role: "assistant", content: "lo" },
        done: false,
      }) + "\n",
      JSON.stringify({
        model: DEFAULT_OLLAMA_MODEL,
        done: true,
        done_reason: "stop",
        eval_count: 5,
      }) + "\n",
    ];
    const fetcher = vi.fn(async () => streamResponse(chunks));
    const transport = new OllamaTransport({ fetch: fetcher });
    const out: string[] = [];
    let sawDone = false;
    for await (const chunk of transport.stream({
      messages: [{ role: "user", content: "hi" }],
      max_tokens: 16,
      temperature: 0,
    })) {
      out.push(chunk.delta);
      if (chunk.done) sawDone = true;
    }
    expect(out.join("")).toBe("Hello");
    expect(sawDone).toBe(true);
  });
});

describe("OllamaTransport.embed", () => {
  it("returns an empty vector (Ollama embeds skipped in local mode by design)", async () => {
    const fetcher = vi.fn();
    const transport = new OllamaTransport({ fetch: fetcher });
    const res = await transport.embed({ text: "hello" });
    expect(res.vector).toEqual([]);
    expect(res.model).toBe(DEFAULT_OLLAMA_MODEL);
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("OllamaTransport.toolCall", () => {
  it("parses a JSON tool envelope into a ToolInvocation", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        model: DEFAULT_OLLAMA_MODEL,
        message: {
          role: "assistant",
          content: '{"tool": "give-hint", "input": {"rung": 2}}',
        },
        done: true,
      }),
    );
    const transport = new OllamaTransport({ fetch: fetcher });
    const res = await transport.toolCall({
      messages: [{ role: "user", content: "stuck" }],
      max_tokens: 64,
      temperature: 0,
      tools: [
        {
          name: "give-hint",
          description: "Surface a graduated hint",
          input_schema: { type: "object", properties: { rung: { type: "number" } } },
        },
      ],
      tool_choice: "auto",
    });
    expect(res.tool_calls).toHaveLength(1);
    expect(res.tool_calls[0]?.name).toBe("give-hint");
    expect(res.tool_calls[0]?.input).toEqual({ rung: 2 });
    expect(res.finish_reason).toBe("tool_use");
  });

  it("returns text + empty tool_calls when JSON parsing fails", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        model: DEFAULT_OLLAMA_MODEL,
        message: {
          role: "assistant",
          content: "I'm not sure which tool to call.",
        },
        done: true,
      }),
    );
    const transport = new OllamaTransport({ fetch: fetcher });
    const res = await transport.toolCall({
      messages: [{ role: "user", content: "hi" }],
      max_tokens: 64,
      temperature: 0,
      tools: [{ name: "give-hint", description: "x", input_schema: { type: "object" } }],
      tool_choice: "auto",
    });
    expect(res.tool_calls).toEqual([]);
    expect(res.text).toContain("I'm not sure");
  });

  it("ignores a JSON envelope referencing a tool not in the allowed set", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        model: DEFAULT_OLLAMA_MODEL,
        message: {
          role: "assistant",
          content: '{"tool": "rm-rf", "input": {}}',
        },
        done: true,
      }),
    );
    const transport = new OllamaTransport({ fetch: fetcher });
    const res = await transport.toolCall({
      messages: [{ role: "user", content: "hi" }],
      max_tokens: 64,
      temperature: 0,
      tools: [{ name: "give-hint", description: "x", input_schema: { type: "object" } }],
      tool_choice: "auto",
    });
    expect(res.tool_calls).toEqual([]);
  });
});

describe("parseToolJson", () => {
  it("extracts a JSON object embedded in surrounding prose", () => {
    const calls = parseToolJson(
      'Sure! Here you go: {"tool":"grade","input":{"verdict":"pass"}} hope this helps.',
      ["grade", "give-hint"],
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]?.name).toBe("grade");
    expect(calls[0]?.input).toEqual({ verdict: "pass" });
  });

  it("returns [] on empty input", () => {
    expect(parseToolJson("", ["grade"])).toEqual([]);
  });

  it("returns [] when the envelope is malformed", () => {
    expect(parseToolJson('{"tool": ""}', ["grade"])).toEqual([]);
  });

  it("returns [] when the parsed tool is not allowed", () => {
    expect(
      parseToolJson('{"tool":"shutdown","input":{}}', ["grade", "give-hint"]),
    ).toEqual([]);
  });
});
