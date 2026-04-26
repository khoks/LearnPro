import type { DailyTokenBudget } from "./budget.js";
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

export interface BudgetGatedLLMProviderOptions {
  inner: LLMProvider;
  budget: DailyTokenBudget;
}

// Decorator that wraps an LLMProvider with a per-user daily token budget. Two effects:
//   1. Pre-call: throws TokenBudgetExceededError if the user is already at/over their daily limit.
//   2. Pre-call: when no explicit model was requested, may downgrade the resolved model by one tier
//      (Opus → Sonnet → Haiku) once the user crosses the configured threshold (default 80%).
//   3. Post-call: records actual input+output tokens so subsequent calls see updated state.
//
// The inner provider stays unaware of the budget — its telemetry sink still fires unmodified, so
// downgrade decisions are observable via the per-event `model` field. Embed calls are passed through
// without budget gating (no per-user usage attribution exists for embeddings yet).
export class BudgetGatedLLMProvider implements LLMProvider {
  readonly name: string;
  private readonly inner: LLMProvider;
  private readonly budget: DailyTokenBudget;

  constructor(opts: BudgetGatedLLMProviderOptions) {
    this.inner = opts.inner;
    this.budget = opts.budget;
    this.name = `budget-gated:${opts.inner.name}`;
  }

  async complete(req: CompleteRequest): Promise<CompleteResponse> {
    await this.budget.assertWithinBudget(req.user_id);
    const decision = await this.budget.decideModel({
      user_id: req.user_id ?? "",
      ...(req.role !== undefined && { role: req.role }),
      ...(req.model !== undefined && { explicit_model: req.model }),
    });
    const next: CompleteRequest = { ...req, model: decision.model };
    const res = await this.inner.complete(next);
    await this.budget.record(req.user_id, res.usage.input_tokens + res.usage.output_tokens);
    return res;
  }

  async *stream(req: CompleteRequest): AsyncIterable<StreamChunk> {
    await this.budget.assertWithinBudget(req.user_id);
    const decision = await this.budget.decideModel({
      user_id: req.user_id ?? "",
      ...(req.role !== undefined && { role: req.role }),
      ...(req.model !== undefined && { explicit_model: req.model }),
    });
    const next: CompleteRequest = { ...req, model: decision.model };
    let approxOutputTokens = 0;
    for await (const chunk of this.inner.stream(next)) {
      if (!chunk.done) approxOutputTokens += Math.max(1, Math.ceil(chunk.delta.length / 4));
      yield chunk;
    }
    await this.budget.record(req.user_id, approxOutputTokens);
  }

  embed(req: EmbedRequest): Promise<EmbedResponse> {
    return this.inner.embed(req);
  }

  async toolCall(req: ToolCallRequest): Promise<ToolCallResponse> {
    await this.budget.assertWithinBudget(req.user_id);
    const decision = await this.budget.decideModel({
      user_id: req.user_id ?? "",
      ...(req.role !== undefined && { role: req.role }),
      ...(req.model !== undefined && { explicit_model: req.model }),
    });
    const next: ToolCallRequest = { ...req, model: decision.model };
    const res = await this.inner.toolCall(next);
    await this.budget.record(req.user_id, res.usage.input_tokens + res.usage.output_tokens);
    return res;
  }
}
