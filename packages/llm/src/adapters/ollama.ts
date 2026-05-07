import { z } from "zod";
import { LLMRequestError } from "../errors.js";
import type { LLMProvider } from "../provider.js";
import { NullLLMTelemetrySink } from "../telemetry.js";
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
} from "../types.js";

// STORY-036 — Ollama local-LLM transport. Hits Ollama's HTTP API at
// `${baseUrl}/api/chat` with the same chat-style request shape Anthropic uses, then unifies
// the response into the @learnpro/llm `CompleteResponse` shape. Pricing is zero (local model).
//
// Embedding: Ollama exposes embeddings via a separate `/api/embeddings` endpoint that returns
// a different shape and only on models that ship an embedding head. To keep this adapter
// portable across models the user may already have installed, we return a best-effort
// `vector: []` from `embed()` — `mastery embeddings are skipped in local mode` is documented
// in `docs/operations/SELF_HOST_OLLAMA.md`. Callers that depend on real vectors fall through
// to the cloud transport when the user picks `auto-fallback`.
//
// Tool calling: smaller open-weight models don't reliably emit Anthropic-style structured
// tool calls. Instead we issue a single-turn chat completion with a JSON-output expectation
// (system message: "Respond with a JSON object matching one of these tool schemas"). If the
// response parses as JSON and matches a tool schema, we synthesise a `ToolInvocation`. If
// parsing fails, we return the raw text with `tool_calls: []` — the caller decides what to
// do (the autonomy controller's safety branch keeps the user on a non-tool response path).

export const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";
export const DEFAULT_OLLAMA_MODEL = "llama3.1:8b-instruct";

const OllamaUsageSchema = z
  .object({
    prompt_eval_count: z.number().int().min(0).optional(),
    eval_count: z.number().int().min(0).optional(),
  })
  .partial();

const OllamaChatResponseSchema = z.object({
  model: z.string(),
  message: z.object({
    role: z.string(),
    content: z.string(),
  }),
  done: z.boolean().optional(),
  done_reason: z.string().optional(),
  prompt_eval_count: z.number().int().min(0).optional(),
  eval_count: z.number().int().min(0).optional(),
});
export type OllamaChatResponse = z.infer<typeof OllamaChatResponseSchema>;

const OllamaStreamChunkSchema = z.object({
  model: z.string(),
  message: z
    .object({
      role: z.string(),
      content: z.string(),
    })
    .optional(),
  done: z.boolean().optional(),
  done_reason: z.string().optional(),
  prompt_eval_count: z.number().int().min(0).optional(),
  eval_count: z.number().int().min(0).optional(),
});

void OllamaUsageSchema;

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface OllamaTransportOptions {
  baseUrl?: string;
  defaultModel?: string;
  fetch?: FetchLike;
  telemetry?: LLMTelemetrySink;
  now?: () => number;
}

export class OllamaTransport implements LLMProvider {
  readonly name = "ollama";

  private readonly baseUrl: string;
  private readonly defaultModel: string;
  private readonly fetcher: FetchLike;
  private readonly telemetry: LLMTelemetrySink;
  private readonly now: () => number;

  constructor(opts: OllamaTransportOptions = {}) {
    this.baseUrl = opts.baseUrl ?? DEFAULT_OLLAMA_BASE_URL;
    this.defaultModel = opts.defaultModel ?? DEFAULT_OLLAMA_MODEL;
    const candidate = opts.fetch ?? (typeof fetch === "function" ? fetch : undefined);
    if (!candidate) {
      throw new Error(
        "OllamaTransport: no `fetch` available — pass `opts.fetch` or run on Node 18+",
      );
    }
    this.fetcher = candidate;
    this.telemetry = opts.telemetry ?? new NullLLMTelemetrySink();
    this.now = opts.now ?? (() => Date.now());
  }

  async complete(req: CompleteRequest): Promise<CompleteResponse> {
    const start = this.now();
    const model = req.model ?? this.defaultModel;
    try {
      const raw = await this.callChat({
        model,
        system: req.system,
        messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
        max_tokens: req.max_tokens,
        temperature: req.temperature,
      });
      const usage = {
        input_tokens: raw.prompt_eval_count ?? 0,
        output_tokens: raw.eval_count ?? 0,
      };
      const out: CompleteResponse = {
        text: raw.message.content,
        model: raw.model,
        finish_reason: mapDoneReason(raw.done_reason),
        usage,
      };
      this.recordTelemetry({ task: "complete", model: raw.model, req, usage, start, ok: true });
      return out;
    } catch (err) {
      this.recordTelemetry({
        task: "complete",
        model,
        req,
        usage: { input_tokens: 0, output_tokens: 0 },
        start,
        ok: false,
      });
      throw new LLMRequestError("Ollama complete failed", this.name, err);
    }
  }

  async *stream(req: CompleteRequest): AsyncIterable<StreamChunk> {
    const start = this.now();
    const model = req.model ?? this.defaultModel;
    let outputTokens = 0;
    let resolvedModel = model;
    try {
      const res = await this.fetcher(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model,
          stream: true,
          messages: this.buildMessages(req.system, req.messages),
          options: {
            num_predict: req.max_tokens,
            temperature: req.temperature,
          },
        }),
      });
      if (!res.ok || !res.body) {
        throw new Error(`Ollama HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffered = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffered += decoder.decode(value, { stream: true });
        const lines = buffered.split("\n");
        buffered = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          let parsed: unknown;
          try {
            parsed = JSON.parse(line);
          } catch {
            continue;
          }
          const validated = OllamaStreamChunkSchema.safeParse(parsed);
          if (!validated.success) continue;
          resolvedModel = validated.data.model;
          if (validated.data.eval_count !== undefined) {
            outputTokens = validated.data.eval_count;
          }
          const text = validated.data.message?.content ?? "";
          if (text) yield { delta: text, done: false };
        }
      }
      yield { delta: "", done: true };
      this.recordTelemetry({
        task: "stream",
        model: resolvedModel,
        req,
        usage: { input_tokens: 0, output_tokens: outputTokens },
        start,
        ok: true,
      });
    } catch (err) {
      this.recordTelemetry({
        task: "stream",
        model,
        req,
        usage: { input_tokens: 0, output_tokens: 0 },
        start,
        ok: false,
      });
      throw new LLMRequestError("Ollama stream failed", this.name, err);
    }
  }

  async embed(req: EmbedRequest): Promise<EmbedResponse> {
    // Best-effort no-op: Ollama's `/api/embeddings` requires an embedding-head model that the
    // self-hoster may not have pulled. Returning an empty vector lets callers detect "no
    // local embedding available" and fall through to a non-vector code path. See
    // docs/operations/SELF_HOST_OLLAMA.md for the recommended setup.
    void req;
    return {
      vector: [],
      model: req.model ?? this.defaultModel,
      usage: {},
    };
  }

  async toolCall(req: ToolCallRequest): Promise<ToolCallResponse> {
    const start = this.now();
    const model = req.model ?? this.defaultModel;
    const toolNames = req.tools.map((t) => t.name);
    const toolHint = buildToolPrompt(req.tools);
    const system = [req.system, toolHint].filter(Boolean).join("\n\n");
    try {
      const raw = await this.callChat({
        model,
        system,
        messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
        max_tokens: req.max_tokens,
        temperature: req.temperature,
      });
      const usage = {
        input_tokens: raw.prompt_eval_count ?? 0,
        output_tokens: raw.eval_count ?? 0,
      };
      const tool_calls = parseToolJson(raw.message.content, toolNames);
      const out: ToolCallResponse = {
        text: raw.message.content,
        tool_calls,
        model: raw.model,
        finish_reason: tool_calls.length > 0 ? "tool_use" : mapDoneReason(raw.done_reason),
        usage,
      };
      this.recordTelemetry({
        task: "tool_call",
        model: raw.model,
        req,
        usage,
        start,
        ok: true,
        ...(tool_calls[0] !== undefined && { tool_used: tool_calls[0].name }),
      });
      return out;
    } catch (err) {
      this.recordTelemetry({
        task: "tool_call",
        model,
        req,
        usage: { input_tokens: 0, output_tokens: 0 },
        start,
        ok: false,
      });
      throw new LLMRequestError("Ollama toolCall failed", this.name, err);
    }
  }

  private async callChat(params: {
    model: string;
    system?: string;
    messages: Array<{ role: "user" | "assistant"; content: string }>;
    max_tokens: number;
    temperature: number;
  }): Promise<OllamaChatResponse> {
    const res = await this.fetcher(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: params.model,
        stream: false,
        messages: this.buildMessages(params.system, params.messages),
        options: {
          num_predict: params.max_tokens,
          temperature: params.temperature,
        },
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Ollama HTTP ${res.status}: ${body}`);
    }
    const json = (await res.json()) as unknown;
    return OllamaChatResponseSchema.parse(json);
  }

  private buildMessages(
    system: string | undefined,
    messages: Array<{ role: "user" | "assistant"; content: string }>,
  ): Array<{ role: string; content: string }> {
    if (!system) return messages;
    return [{ role: "system", content: system }, ...messages];
  }

  private recordTelemetry(opts: {
    task: "complete" | "stream" | "tool_call";
    model: string;
    req: CompleteRequest;
    usage: { input_tokens: number; output_tokens: number };
    start: number;
    ok: boolean;
    tool_used?: string;
  }): void {
    this.telemetry.record({
      provider: this.name,
      model: opts.model,
      task: opts.task,
      input_tokens: opts.usage.input_tokens,
      output_tokens: opts.usage.output_tokens,
      // Local model — no API spend.
      cost_usd: 0,
      pricing_version: "local",
      latency_ms: Math.max(0, this.now() - opts.start),
      ok: opts.ok,
      decided_at: new Date(this.now()).toISOString(),
      ...(opts.req.role !== undefined && { role: opts.req.role }),
      ...(opts.req.user_id !== undefined && { user_id: opts.req.user_id }),
      ...(opts.req.session_id !== undefined && { session_id: opts.req.session_id }),
      ...(opts.req.prompt_version !== undefined && { prompt_version: opts.req.prompt_version }),
      ...(opts.tool_used !== undefined && { tool_used: opts.tool_used }),
    });
  }
}

function mapDoneReason(reason: string | undefined): FinishReason {
  switch (reason) {
    case "stop":
      return "end_turn";
    case "length":
      return "max_tokens";
    case undefined:
      return "end_turn";
    default:
      return "other";
  }
}

function buildToolPrompt(
  tools: Array<{ name: string; description: string; input_schema: Record<string, unknown> }>,
): string {
  const list = tools
    .map((t) => `- ${t.name}: ${t.description}\n  input_schema: ${JSON.stringify(t.input_schema)}`)
    .join("\n");
  return [
    "You can call one of the tools below by responding with a JSON object of the form:",
    `  { "tool": "<tool_name>", "input": { ... } }`,
    "If no tool fits, respond with plain text instead. The tools available are:",
    list,
  ].join("\n");
}

const ToolEnvelopeSchema = z.object({
  tool: z.string().min(1),
  input: z.record(z.string(), z.unknown()).default({}),
});

export function parseToolJson(text: string, allowedTools: string[]): ToolInvocation[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const candidates: string[] = [trimmed];
  // Extract the first {...} block in case the model wrapped its JSON in prose.
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }
  const allowed = new Set(allowedTools);
  for (const candidate of candidates) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate);
    } catch {
      continue;
    }
    const validated = ToolEnvelopeSchema.safeParse(parsed);
    if (!validated.success) continue;
    if (!allowed.has(validated.data.tool)) continue;
    return [
      {
        id: `ollama_tool_${Math.random().toString(36).slice(2, 10)}`,
        name: validated.data.tool,
        input: validated.data.input,
      },
    ];
  }
  return [];
}
