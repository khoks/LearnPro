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

// STORY-036 — Per-request router for the Tutor mode toggle. Wraps two `LLMProvider` instances
// (cloud + local) and picks one per call based on a `getMode(req)` callback that the caller
// supplies. The callback receives the request so it can look up the user's preference from
// the DB. `auto-fallback` tries cloud first, falls back to local on cloud failure.
//
// The router is a thin pass-through: it never changes the `req` shape, so downstream
// telemetry / cost / budget decorators wrapping the underlying providers see the same
// requests they always do. This keeps STORY-012's `BudgetGatedLLMProvider` and STORY-060's
// `DrizzleLLMTelemetrySink` working unchanged whether the user is on cloud or local.

export type TutorModeKind = "cloud" | "local" | "auto-fallback";

export type GetTutorMode = (req: {
  user_id?: string;
  session_id?: string;
}) => Promise<TutorModeKind>;

export interface LLMRouterOptions {
  cloud: LLMProvider;
  local: LLMProvider;
  getMode: GetTutorMode;
  // Default mode used when the request has no `user_id` (e.g. unauthenticated dev pings).
  defaultMode?: TutorModeKind;
  onFallback?: (err: unknown, req: { user_id?: string; session_id?: string; task: string }) => void;
}

export class LLMRouter implements LLMProvider {
  readonly name = "llm-router";

  private readonly cloud: LLMProvider;
  private readonly local: LLMProvider;
  private readonly getMode: GetTutorMode;
  private readonly defaultMode: TutorModeKind;
  private readonly onFallback?: (
    err: unknown,
    req: { user_id?: string; session_id?: string; task: string },
  ) => void;

  constructor(opts: LLMRouterOptions) {
    this.cloud = opts.cloud;
    this.local = opts.local;
    this.getMode = opts.getMode;
    this.defaultMode = opts.defaultMode ?? "cloud";
    if (opts.onFallback) this.onFallback = opts.onFallback;
  }

  async complete(req: CompleteRequest): Promise<CompleteResponse> {
    const mode = await this.resolveMode(req);
    if (mode === "local") return this.local.complete(req);
    if (mode === "cloud") return this.cloud.complete(req);
    try {
      return await this.cloud.complete(req);
    } catch (err) {
      this.onFallback?.(err, fallbackContext(req, "complete"));
      return this.local.complete(req);
    }
  }

  async *stream(req: CompleteRequest): AsyncIterable<StreamChunk> {
    const mode = await this.resolveMode(req);
    const provider = mode === "local" ? this.local : this.cloud;
    // No mid-stream fallback — partial output already streamed to the client. If `auto-fallback`
    // is on and cloud throws synchronously before yielding, we restart on local. Once any
    // chunk has been yielded we trust the connection.
    if (mode === "auto-fallback") {
      const iter = await this.openStream(this.cloud, req).catch(async (err) => {
        this.onFallback?.(err, fallbackContext(req, "stream"));
        return this.openStream(this.local, req);
      });
      yield* iter;
      return;
    }
    yield* await this.openStream(provider, req);
  }

  async embed(req: EmbedRequest): Promise<EmbedResponse> {
    const mode = await this.resolveMode({ user_id: undefined });
    if (mode === "local") return this.local.embed(req);
    if (mode === "cloud") return this.cloud.embed(req);
    try {
      return await this.cloud.embed(req);
    } catch (err) {
      this.onFallback?.(err, { task: "embed" });
      return this.local.embed(req);
    }
  }

  async toolCall(req: ToolCallRequest): Promise<ToolCallResponse> {
    const mode = await this.resolveMode(req);
    if (mode === "local") return this.local.toolCall(req);
    if (mode === "cloud") return this.cloud.toolCall(req);
    try {
      return await this.cloud.toolCall(req);
    } catch (err) {
      this.onFallback?.(err, fallbackContext(req, "tool_call"));
      return this.local.toolCall(req);
    }
  }

  private async resolveMode(req: {
    user_id?: string;
    session_id?: string;
  }): Promise<TutorModeKind> {
    if (!req.user_id) return this.defaultMode;
    try {
      return await this.getMode(req);
    } catch {
      return this.defaultMode;
    }
  }

  private async openStream(
    provider: LLMProvider,
    req: CompleteRequest,
  ): Promise<AsyncIterable<StreamChunk>> {
    return provider.stream(req);
  }
}

function fallbackContext(
  req: { user_id?: string; session_id?: string },
  task: string,
): { user_id?: string; session_id?: string; task: string } {
  return {
    task,
    ...(req.user_id !== undefined && { user_id: req.user_id }),
    ...(req.session_id !== undefined && { session_id: req.session_id }),
  };
}
