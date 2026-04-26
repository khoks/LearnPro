export const PACKAGE_NAME = "@learnpro/llm";

export type { LLMProvider } from "./provider.js";

export {
  AnthropicProvider,
  type AnthropicCreateParams,
  type AnthropicMessageResponse,
  type AnthropicProviderOptions,
  type AnthropicStreamEvent,
  type AnthropicTransport,
} from "./anthropic.js";
export {
  AnthropicSdkTransport,
  type AnthropicSdkTransportOptions,
} from "./anthropic-sdk-transport.js";
export { OpenAIProvider } from "./openai.js";
export { OllamaProvider } from "./ollama.js";

export {
  ANTHROPIC_HAIKU,
  ANTHROPIC_OPUS,
  ANTHROPIC_EMBED,
  DEFAULT_ROLE_MODEL_MAP,
  RoleModelMapSchema,
  modelForRole,
  resolveModel,
  type RoleModelMap,
} from "./models.js";

export {
  buildLLMProvider,
  loadLLMConfigFromEnv,
  LLMConfigSchema,
  type BuildLLMOptions,
  type LLMConfig,
} from "./registry.js";

export { InMemoryLLMTelemetrySink, NullLLMTelemetrySink } from "./telemetry.js";

export {
  ANTHROPIC_SONNET,
  MODEL_PRICING,
  PRICING_VERSION,
  costFor,
  type CostInput,
  type CostResult,
  type ModelPrice,
} from "./pricing.js";

export {
  DailyTokenBudget,
  InMemoryUsageStore,
  MODEL_TIERS,
  type DailyTokenBudgetOptions,
  type DailyUsage,
  type DecideModelInput,
  type DecideModelResult,
  type ModelTier,
  type UsageStore,
} from "./budget.js";

export {
  BudgetGatedLLMProvider,
  type BudgetGatedLLMProviderOptions,
} from "./budget-gated-provider.js";

export {
  ChatMessageSchema,
  ChatRoleSchema,
  CompleteRequestSchema,
  CompleteResponseSchema,
  EmbedRequestSchema,
  EmbedResponseSchema,
  FinishReasonSchema,
  LLMRoleSchema,
  LLMTelemetryEventSchema,
  StreamChunkSchema,
  ToolCallRequestSchema,
  ToolCallResponseSchema,
  ToolDefinitionSchema,
  ToolInvocationSchema,
  TokenUsageSchema,
  type ChatMessage,
  type ChatRole,
  type CompleteRequest,
  type CompleteResponse,
  type EmbedRequest,
  type EmbedResponse,
  type FinishReason,
  type LLMRole,
  type LLMTelemetryEvent,
  type LLMTelemetrySink,
  type StreamChunk,
  type ToolCallRequest,
  type ToolCallResponse,
  type ToolDefinition,
  type ToolInvocation,
  type TokenUsage,
} from "./types.js";

export { LLMRequestError, NotImplementedError, TokenBudgetExceededError } from "./errors.js";

export { DEFAULT_RETRY, isTransient, withRetry, type RetryOptions } from "./retry.js";
