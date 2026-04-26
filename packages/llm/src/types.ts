import { z } from "zod";

export const LLMRoleSchema = z.enum(["tutor", "interviewer", "reflection", "grader", "router"]);
export type LLMRole = z.infer<typeof LLMRoleSchema>;

export const ChatRoleSchema = z.enum(["user", "assistant"]);
export type ChatRole = z.infer<typeof ChatRoleSchema>;

export const ChatMessageSchema = z.object({
  role: ChatRoleSchema,
  content: z.string(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const ToolDefinitionSchema = z.object({
  name: z.string(),
  description: z.string(),
  input_schema: z.record(z.string(), z.unknown()),
});
export type ToolDefinition = z.infer<typeof ToolDefinitionSchema>;

export const CompleteRequestSchema = z.object({
  messages: z.array(ChatMessageSchema).min(1),
  role: LLMRoleSchema.optional(),
  model: z.string().optional(),
  system: z.string().optional(),
  max_tokens: z.number().int().positive().default(1024),
  temperature: z.number().min(0).max(2).default(0.7),
  user_id: z.string().optional(),
  prompt_version: z.string().optional(),
  session_id: z.string().optional(),
});
export type CompleteRequest = z.infer<typeof CompleteRequestSchema>;

export const TokenUsageSchema = z.object({
  input_tokens: z.number().int().min(0),
  output_tokens: z.number().int().min(0),
});
export type TokenUsage = z.infer<typeof TokenUsageSchema>;

export const FinishReasonSchema = z.enum([
  "end_turn",
  "max_tokens",
  "stop_sequence",
  "tool_use",
  "other",
]);
export type FinishReason = z.infer<typeof FinishReasonSchema>;

export const CompleteResponseSchema = z.object({
  text: z.string(),
  model: z.string(),
  finish_reason: FinishReasonSchema,
  usage: TokenUsageSchema,
});
export type CompleteResponse = z.infer<typeof CompleteResponseSchema>;

export const StreamChunkSchema = z.object({
  delta: z.string(),
  done: z.boolean(),
});
export type StreamChunk = z.infer<typeof StreamChunkSchema>;

export const EmbedRequestSchema = z.object({
  text: z.string().min(1),
  model: z.string().optional(),
});
export type EmbedRequest = z.infer<typeof EmbedRequestSchema>;

export const EmbedResponseSchema = z.object({
  vector: z.array(z.number()),
  model: z.string(),
  usage: TokenUsageSchema.partial(),
});
export type EmbedResponse = z.infer<typeof EmbedResponseSchema>;

export const ToolCallRequestSchema = CompleteRequestSchema.extend({
  tools: z.array(ToolDefinitionSchema).min(1),
  tool_choice: z.enum(["auto", "any"]).default("auto"),
});
export type ToolCallRequest = z.infer<typeof ToolCallRequestSchema>;

export const ToolInvocationSchema = z.object({
  id: z.string(),
  name: z.string(),
  input: z.record(z.string(), z.unknown()),
});
export type ToolInvocation = z.infer<typeof ToolInvocationSchema>;

export const ToolCallResponseSchema = z.object({
  text: z.string(),
  tool_calls: z.array(ToolInvocationSchema),
  model: z.string(),
  finish_reason: FinishReasonSchema,
  usage: TokenUsageSchema,
});
export type ToolCallResponse = z.infer<typeof ToolCallResponseSchema>;

export const LLMTelemetryEventSchema = z.object({
  provider: z.string(),
  model: z.string(),
  role: LLMRoleSchema.optional(),
  prompt_version: z.string().optional(),
  user_id: z.string().optional(),
  session_id: z.string().optional(),
  task: z.enum(["complete", "stream", "embed", "tool_call"]),
  input_tokens: z.number().int().min(0),
  output_tokens: z.number().int().min(0),
  cached_tokens: z.number().int().min(0).optional(),
  cost_usd: z.number().min(0),
  pricing_version: z.string(),
  tool_used: z.string().optional(),
  latency_ms: z.number().int().min(0),
  ok: z.boolean(),
  decided_at: z.string(),
});
export type LLMTelemetryEvent = z.infer<typeof LLMTelemetryEventSchema>;

export interface LLMTelemetrySink {
  record(event: LLMTelemetryEvent): void;
}
