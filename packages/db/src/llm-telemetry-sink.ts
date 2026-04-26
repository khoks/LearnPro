import type { LLMTelemetryEvent, LLMTelemetrySink } from "@learnpro/llm";
import type { LearnProDb } from "./client.js";
import { agent_calls } from "./schema.js";

export interface DrizzleLLMTelemetrySinkOptions {
  db: LearnProDb;
  // org_id stamped on every row. Defaults to the schema's "self" default if omitted.
  org_id?: string;
  // Telemetry must never break an LLM call — failures are logged here and swallowed.
  logger?: (msg: string, err: unknown) => void;
}

// DB-backed sink for `LLMTelemetryEvent` records — writes one row per event into `agent_calls`.
//
// Failure mode: any insert error is caught + handed to `logger` (default: console.error) and
// dropped. A telemetry outage must NOT take down the LLM call path.
//
// Note on cost_usd: stored as `numeric(18, 8)` for precision. We pass it as a string via
// `toFixed(8)` so the SQL driver doesn't round-trip through float64. Read back with `Number(row.cost_usd)`.
export class DrizzleLLMTelemetrySink implements LLMTelemetrySink {
  private readonly db: LearnProDb;
  private readonly org_id: string | undefined;
  private readonly logger: (msg: string, err: unknown) => void;

  constructor(opts: DrizzleLLMTelemetrySinkOptions) {
    this.db = opts.db;
    this.org_id = opts.org_id;
    this.logger = opts.logger ?? defaultLogger;
  }

  record(event: LLMTelemetryEvent): void {
    this.insert(event).catch((err: unknown) => {
      this.logger("[llm-telemetry-sink] insert failed", err);
    });
  }

  private async insert(event: LLMTelemetryEvent): Promise<void> {
    await this.db.insert(agent_calls).values({
      provider: event.provider,
      model: event.model,
      task: event.task,
      input_tokens: event.input_tokens,
      output_tokens: event.output_tokens,
      cost_usd: event.cost_usd.toFixed(8),
      pricing_version: event.pricing_version,
      latency_ms: event.latency_ms,
      ok: event.ok,
      called_at: parseDecidedAt(event.decided_at),
      ...(event.role !== undefined && { role: event.role }),
      ...(event.user_id !== undefined && { user_id: event.user_id }),
      ...(event.session_id !== undefined && { session_id: event.session_id }),
      ...(event.cached_tokens !== undefined && { cached_tokens: event.cached_tokens }),
      ...(event.tool_used !== undefined && { tool_used: event.tool_used }),
      ...(event.prompt_version !== undefined && { prompt_version: event.prompt_version }),
      ...(this.org_id !== undefined && { org_id: this.org_id }),
    });
  }
}

function defaultLogger(msg: string, err: unknown): void {
  console.error(msg, err);
}

function parseDecidedAt(decided_at: string): Date {
  const d = new Date(decided_at);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}
