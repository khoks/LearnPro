import { describe, expect, it } from "vitest";
import { buildLLMProvider, loadLLMConfigFromEnv, LLMConfigSchema } from "./registry.js";
import type { AnthropicTransport } from "./anthropic.js";
import { NotImplementedError } from "./errors.js";

const noopTransport: AnthropicTransport = {
  async createMessage() {
    return {
      model: "x",
      stop_reason: "end_turn",
      usage: { input_tokens: 0, output_tokens: 0 },
      content: [{ type: "text", text: "" }],
    };
  },
  async *streamMessage() {},
};

describe("LLMConfigSchema", () => {
  it("defaults to anthropic when no input", () => {
    const cfg = LLMConfigSchema.parse({});
    expect(cfg.provider).toBe("anthropic");
  });

  it("accepts an explicit role-model override", () => {
    const cfg = LLMConfigSchema.parse({
      provider: "anthropic",
      models: { tutor: "claude-opus-4-7-preview" },
    });
    expect(cfg.models?.tutor).toBe("claude-opus-4-7-preview");
    expect(cfg.models?.grader).toBe("claude-haiku-4-5-20251001");
  });
});

describe("buildLLMProvider", () => {
  it("builds AnthropicProvider with injected transport", () => {
    const provider = buildLLMProvider({ anthropicTransport: noopTransport });
    expect(provider.name).toBe("anthropic");
  });

  it("throws if anthropic chosen without transport", () => {
    expect(() => buildLLMProvider({})).toThrowError(/anthropicTransport/);
  });

  it("returns OpenAIProvider stub", () => {
    const provider = buildLLMProvider({
      config: LLMConfigSchema.parse({ provider: "openai" }),
    });
    expect(provider.name).toBe("openai");
    expect(() =>
      provider.complete({
        messages: [{ role: "user", content: "x" }],
        max_tokens: 1,
        temperature: 0,
      }),
    ).toThrow(NotImplementedError);
  });

  it("returns OllamaProvider stub", () => {
    const provider = buildLLMProvider({
      config: LLMConfigSchema.parse({ provider: "ollama" }),
    });
    expect(provider.name).toBe("ollama");
  });
});

describe("loadLLMConfigFromEnv", () => {
  it("returns defaults when env var is not set", () => {
    expect(loadLLMConfigFromEnv({})).toEqual(LLMConfigSchema.parse({}));
  });

  it("parses a JSON config from LEARNPRO_LLM_CONFIG", () => {
    const cfg = loadLLMConfigFromEnv({
      LEARNPRO_LLM_CONFIG: JSON.stringify({ provider: "openai" }),
    });
    expect(cfg.provider).toBe("openai");
  });

  it("throws on invalid JSON", () => {
    expect(() => loadLLMConfigFromEnv({ LEARNPRO_LLM_CONFIG: "{not json" })).toThrowError(
      /not valid JSON/,
    );
  });
});
