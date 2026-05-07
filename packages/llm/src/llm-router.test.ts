import { describe, expect, it, vi } from "vitest";
import { LLMRouter, type GetTutorMode } from "./llm-router.js";
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

// STORY-036 — covers the three branches of the tutor mode toggle:
//
//   1. `cloud` → delegates to AnthropicSdkTransport (asserted by which fake gets called).
//   2. `local` → delegates to OllamaTransport.
//   3. `auto-fallback` → tries cloud, falls back on cloud failure.

function makeFake(name: string, response: Partial<CompleteResponse> = {}): LLMProvider {
  const complete = vi.fn(
    async (req: CompleteRequest): Promise<CompleteResponse> => ({
      text: response.text ?? `${name}-text`,
      model: response.model ?? `${name}-model`,
      finish_reason: response.finish_reason ?? "end_turn",
      usage: response.usage ?? { input_tokens: 1, output_tokens: 1 },
    }),
  );
  const stream = vi.fn(async function* (): AsyncIterable<StreamChunk> {
    yield { delta: name, done: false };
    yield { delta: "", done: true };
  });
  const embed = vi.fn(
    async (req: EmbedRequest): Promise<EmbedResponse> => ({
      vector: [],
      model: `${name}-embed`,
      usage: {},
    }),
  );
  const toolCall = vi.fn(
    async (req: ToolCallRequest): Promise<ToolCallResponse> => ({
      text: `${name}-tool-text`,
      tool_calls: [],
      model: `${name}-model`,
      finish_reason: "end_turn",
      usage: { input_tokens: 1, output_tokens: 1 },
    }),
  );
  // Discard unused
  void complete;
  void stream;
  void embed;
  void toolCall;
  return { name, complete, stream, embed, toolCall };
}

const userReq: CompleteRequest = {
  messages: [{ role: "user", content: "hi" }],
  user_id: "user-1",
  max_tokens: 16,
  temperature: 0,
};

describe("LLMRouter", () => {
  it("AC #6 — cloud mode delegates to the cloud transport (no local calls)", async () => {
    const cloud = makeFake("cloud");
    const local = makeFake("local");
    const getMode: GetTutorMode = async () => "cloud";
    const router = new LLMRouter({ cloud, local, getMode });
    const out = await router.complete(userReq);

    expect(out.text).toBe("cloud-text");
    expect(cloud.complete).toHaveBeenCalledTimes(1);
    expect(local.complete).not.toHaveBeenCalled();
  });

  it("local mode delegates to the local transport (no cloud calls)", async () => {
    const cloud = makeFake("cloud");
    const local = makeFake("local");
    const getMode: GetTutorMode = async () => "local";
    const router = new LLMRouter({ cloud, local, getMode });
    const out = await router.complete(userReq);

    expect(out.text).toBe("local-text");
    expect(local.complete).toHaveBeenCalledTimes(1);
    expect(cloud.complete).not.toHaveBeenCalled();
  });

  it("auto-fallback tries cloud first when cloud succeeds", async () => {
    const cloud = makeFake("cloud");
    const local = makeFake("local");
    const getMode: GetTutorMode = async () => "auto-fallback";
    const router = new LLMRouter({ cloud, local, getMode });
    const out = await router.complete(userReq);

    expect(out.text).toBe("cloud-text");
    expect(cloud.complete).toHaveBeenCalledTimes(1);
    expect(local.complete).not.toHaveBeenCalled();
  });

  it("auto-fallback falls back to local on cloud failure", async () => {
    const cloud = makeFake("cloud");
    const local = makeFake("local");
    cloud.complete = vi.fn(async () => {
      throw new Error("cloud is down");
    });
    const getMode: GetTutorMode = async () => "auto-fallback";
    const onFallback = vi.fn();
    const router = new LLMRouter({ cloud, local, getMode, onFallback });
    const out = await router.complete(userReq);

    expect(out.text).toBe("local-text");
    expect(local.complete).toHaveBeenCalledTimes(1);
    expect(onFallback).toHaveBeenCalledTimes(1);
    expect(onFallback.mock.calls[0]?.[1]).toMatchObject({ task: "complete", user_id: "user-1" });
  });

  it("uses defaultMode when the request has no user_id", async () => {
    const cloud = makeFake("cloud");
    const local = makeFake("local");
    const getMode = vi.fn(async () => "local" as const);
    const router = new LLMRouter({
      cloud,
      local,
      getMode,
      defaultMode: "cloud",
    });
    await router.complete({
      messages: [{ role: "user", content: "ping" }],
      max_tokens: 16,
      temperature: 0,
    });
    expect(cloud.complete).toHaveBeenCalledTimes(1);
    expect(getMode).not.toHaveBeenCalled();
  });

  it("falls back to defaultMode when getMode throws", async () => {
    const cloud = makeFake("cloud");
    const local = makeFake("local");
    const getMode: GetTutorMode = async () => {
      throw new Error("db is down");
    };
    const router = new LLMRouter({ cloud, local, getMode, defaultMode: "cloud" });
    const out = await router.complete(userReq);
    expect(out.text).toBe("cloud-text");
  });

  it("routes toolCall through the resolved provider", async () => {
    const cloud = makeFake("cloud");
    const local = makeFake("local");
    const getMode: GetTutorMode = async () => "local";
    const router = new LLMRouter({ cloud, local, getMode });
    const out = await router.toolCall({
      ...userReq,
      tools: [{ name: "give-hint", description: "x", input_schema: { type: "object" } }],
      tool_choice: "auto",
    });
    expect(out.text).toBe("local-tool-text");
    expect(cloud.toolCall).not.toHaveBeenCalled();
  });

  it("streams from the resolved provider", async () => {
    const cloud = makeFake("cloud");
    const local = makeFake("local");
    const getMode: GetTutorMode = async () => "local";
    const router = new LLMRouter({ cloud, local, getMode });
    const chunks: string[] = [];
    for await (const chunk of router.stream(userReq)) {
      chunks.push(chunk.delta);
    }
    expect(chunks.filter(Boolean).join("")).toBe("local");
  });

  it("auto-fallback streaming falls back when cloud.stream throws synchronously", async () => {
    const cloud = makeFake("cloud");
    const local = makeFake("local");
    cloud.stream = vi.fn((): AsyncIterable<StreamChunk> => {
      throw new Error("cloud disconnect");
    });
    const getMode: GetTutorMode = async () => "auto-fallback";
    const onFallback = vi.fn();
    const router = new LLMRouter({ cloud, local, getMode, onFallback });
    const chunks: string[] = [];
    for await (const chunk of router.stream(userReq)) {
      chunks.push(chunk.delta);
    }
    expect(chunks.filter(Boolean).join("")).toBe("local");
    expect(onFallback).toHaveBeenCalledTimes(1);
  });
});
