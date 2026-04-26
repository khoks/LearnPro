import { LLMRequestError, NotImplementedError } from "./errors.js";
import type { LLMProvider } from "./provider.js";
import { DEFAULT_ROLE_MODEL_MAP, resolveModel, type RoleModelMap } from "./models.js";
import { NullLLMTelemetrySink } from "./telemetry.js";
import { DEFAULT_RETRY, withRetry, type RetryOptions } from "./retry.js";
import {
  type CompleteRequest,
  type CompleteResponse,
  type EmbedRequest,
  type EmbedResponse,
  type FinishReason,
  type LLMTelemetrySink,
  type StreamChunk,
  type ToolCallRequest,
  type ToolCallResponse,
  type ToolInvocation,
} from "./types.js";

export interface AnthropicCreateParams {
  model: string;
  max_tokens: number;
  temperature: number;
  system?: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  tools?: Array<{ name: string; description: string; input_schema: Record<string, unknown> }>;
  tool_choice?: { type: "auto" } | { type: "any" } | { type: "tool"; name: string };
}

export interface AnthropicMessageResponse {
  model: string;
  stop_reason: string | null;
  usage: { input_tokens: number; output_tokens: number };
  content: Array<
    | { type: "text"; text: string }
    | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  >;
}

export interface AnthropicStreamEvent {
  type:
    | "content_block_delta"
    | "message_start"
    | "message_delta"
    | "message_stop"
    | "content_block_start"
    | "content_block_stop";
  delta?: { type: "text_delta"; text: string } | { type: string; [k: string]: unknown };
}

export interface AnthropicTransport {
  createMessage(params: AnthropicCreateParams): Promise<AnthropicMessageResponse>;
  streamMessage(params: AnthropicCreateParams): AsyncIterable<AnthropicStreamEvent>;
}

export interface AnthropicProviderOptions {
  transport: AnthropicTransport;
  models?: RoleModelMap;
  telemetry?: LLMTelemetrySink;
  retry?: RetryOptions;
  now?: () => number;
}

function mapStopReason(stop: string | null): FinishReason {
  switch (stop) {
    case "end_turn":
      return "end_turn";
    case "max_tokens":
      return "max_tokens";
    case "stop_sequence":
      return "stop_sequence";
    case "tool_use":
      return "tool_use";
    default:
      return "other";
  }
}

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";

  private readonly transport: AnthropicTransport;
  private readonly models: RoleModelMap;
  private readonly telemetry: LLMTelemetrySink;
  private readonly retry: RetryOptions;
  private readonly now: () => number;

  constructor(opts: AnthropicProviderOptions) {
    this.transport = opts.transport;
    this.models = opts.models ?? DEFAULT_ROLE_MODEL_MAP;
    this.telemetry = opts.telemetry ?? new NullLLMTelemetrySink();
    this.retry = opts.retry ?? DEFAULT_RETRY;
    this.now = opts.now ?? (() => Date.now());
  }

  private buildParams(
    req: CompleteRequest,
    extra?: Partial<AnthropicCreateParams>,
  ): AnthropicCreateParams {
    const base: AnthropicCreateParams = {
      model: resolveModel({ explicit: req.model, role: req.role, map: this.models }),
      max_tokens: req.max_tokens,
      temperature: req.temperature,
      messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
    };
    if (req.system !== undefined) base.system = req.system;
    return { ...base, ...(extra ?? {}) };
  }

  async complete(req: CompleteRequest): Promise<CompleteResponse> {
    const start = this.now();
    const params = this.buildParams(req);
    try {
      const res = await withRetry(() => this.transport.createMessage(params), this.retry);
      const text = res.content
        .filter((c): c is { type: "text"; text: string } => c.type === "text")
        .map((c) => c.text)
        .join("");
      const out: CompleteResponse = {
        text,
        model: res.model,
        finish_reason: mapStopReason(res.stop_reason),
        usage: { input_tokens: res.usage.input_tokens, output_tokens: res.usage.output_tokens },
      };
      this.recordTelemetry({
        task: "complete",
        model: res.model,
        req,
        usage: out.usage,
        start,
        ok: true,
      });
      return out;
    } catch (err) {
      this.recordTelemetry({
        task: "complete",
        model: params.model,
        req,
        usage: { input_tokens: 0, output_tokens: 0 },
        start,
        ok: false,
      });
      throw new LLMRequestError("Anthropic complete failed", this.name, err);
    }
  }

  async *stream(req: CompleteRequest): AsyncIterable<StreamChunk> {
    const start = this.now();
    const params = this.buildParams(req);
    let outputChars = 0;
    try {
      for await (const event of this.transport.streamMessage(params)) {
        if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
          const text = (event.delta as { text: string }).text;
          outputChars += text.length;
          yield { delta: text, done: false };
        }
      }
      yield { delta: "", done: true };
      this.recordTelemetry({
        task: "stream",
        model: params.model,
        req,
        usage: { input_tokens: 0, output_tokens: Math.ceil(outputChars / 4) },
        start,
        ok: true,
      });
    } catch (err) {
      this.recordTelemetry({
        task: "stream",
        model: params.model,
        req,
        usage: { input_tokens: 0, output_tokens: 0 },
        start,
        ok: false,
      });
      throw new LLMRequestError("Anthropic stream failed", this.name, err);
    }
  }

  embed(_req: EmbedRequest): Promise<EmbedResponse> {
    throw new NotImplementedError(this.name, "embed");
  }

  async toolCall(req: ToolCallRequest): Promise<ToolCallResponse> {
    const start = this.now();
    const params = this.buildParams(req, {
      tools: req.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema,
      })),
      tool_choice: { type: req.tool_choice },
    });
    try {
      const res = await withRetry(() => this.transport.createMessage(params), this.retry);
      const text = res.content
        .filter((c): c is { type: "text"; text: string } => c.type === "text")
        .map((c) => c.text)
        .join("");
      const tool_calls: ToolInvocation[] = res.content
        .filter(
          (
            c,
          ): c is { type: "tool_use"; id: string; name: string; input: Record<string, unknown> } =>
            c.type === "tool_use",
        )
        .map((c) => ({ id: c.id, name: c.name, input: c.input }));
      const out: ToolCallResponse = {
        text,
        tool_calls,
        model: res.model,
        finish_reason: mapStopReason(res.stop_reason),
        usage: { input_tokens: res.usage.input_tokens, output_tokens: res.usage.output_tokens },
      };
      this.recordTelemetry({
        task: "tool_call",
        model: res.model,
        req,
        usage: out.usage,
        start,
        ok: true,
      });
      return out;
    } catch (err) {
      this.recordTelemetry({
        task: "tool_call",
        model: params.model,
        req,
        usage: { input_tokens: 0, output_tokens: 0 },
        start,
        ok: false,
      });
      throw new LLMRequestError("Anthropic toolCall failed", this.name, err);
    }
  }

  private recordTelemetry(opts: {
    task: "complete" | "stream" | "embed" | "tool_call";
    model: string;
    req: CompleteRequest;
    usage: { input_tokens: number; output_tokens: number };
    start: number;
    ok: boolean;
  }): void {
    this.telemetry.record({
      provider: this.name,
      model: opts.model,
      task: opts.task,
      input_tokens: opts.usage.input_tokens,
      output_tokens: opts.usage.output_tokens,
      latency_ms: Math.max(0, this.now() - opts.start),
      ok: opts.ok,
      decided_at: new Date(this.now()).toISOString(),
      ...(opts.req.role !== undefined && { role: opts.req.role }),
      ...(opts.req.user_id !== undefined && { user_id: opts.req.user_id }),
      ...(opts.req.prompt_version !== undefined && { prompt_version: opts.req.prompt_version }),
    });
  }
}
