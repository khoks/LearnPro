import { z } from "zod";
import { AnthropicProvider, type AnthropicTransport } from "./anthropic.js";
import { OpenAIProvider } from "./openai.js";
import { OllamaProvider } from "./ollama.js";
import { RoleModelMapSchema, type RoleModelMap } from "./models.js";
import { NullLLMTelemetrySink } from "./telemetry.js";
import type { LLMProvider } from "./provider.js";
import type { LLMTelemetrySink } from "./types.js";

export const LLMConfigSchema = z.object({
  provider: z.enum(["anthropic", "openai", "ollama"]).default("anthropic"),
  models: RoleModelMapSchema.optional(),
});
export type LLMConfig = z.infer<typeof LLMConfigSchema>;

export interface BuildLLMOptions {
  config?: LLMConfig;
  telemetry?: LLMTelemetrySink;
  anthropicTransport?: AnthropicTransport;
}

export function buildLLMProvider(opts: BuildLLMOptions = {}): LLMProvider {
  const config = opts.config ?? LLMConfigSchema.parse({});
  const telemetry = opts.telemetry ?? new NullLLMTelemetrySink();
  const models: RoleModelMap | undefined = config.models;

  switch (config.provider) {
    case "anthropic": {
      if (!opts.anthropicTransport) {
        throw new Error(
          "buildLLMProvider: anthropic provider requires `anthropicTransport` (use AnthropicSdkTransport in app code, or a fake in tests)",
        );
      }
      return new AnthropicProvider({
        transport: opts.anthropicTransport,
        telemetry,
        ...(models !== undefined && { models }),
      });
    }
    case "openai":
      return new OpenAIProvider();
    case "ollama":
      return new OllamaProvider();
  }
}

export function loadLLMConfigFromEnv(env: NodeJS.ProcessEnv): LLMConfig {
  const raw = env["LEARNPRO_LLM_CONFIG"];
  if (!raw) return LLMConfigSchema.parse({});
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`LEARNPRO_LLM_CONFIG is not valid JSON: ${(err as Error).message}`);
  }
  return LLMConfigSchema.parse(parsed);
}
