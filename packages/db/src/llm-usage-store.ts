import { and, eq, gte, sql } from "drizzle-orm";
import type { UsageStore } from "@learnpro/llm";
import type { LearnProDb } from "./client.js";
import { agent_calls } from "./schema.js";

export interface DrizzleUsageStoreOptions {
  db: LearnProDb;
}

// DB-backed `UsageStore` that aggregates today's tokens against the `agent_calls` table.
//
// `today()` runs `SELECT sum(input_tokens + output_tokens) WHERE user_id = $1 AND called_at >= start_of_utc_day`.
// Returns 0 when the user has no calls yet today (sum() over zero rows returns NULL in Postgres).
//
// `record()` is intentionally a no-op: the telemetry sink is the single source of truth for token
// counts. If we also incremented here, every LLM call would double-count once it landed in the DB.
// (The in-memory sibling `InMemoryUsageStore` does write in `record()` because it has no shared sink.)
export class DrizzleUsageStore implements UsageStore {
  private readonly db: LearnProDb;

  constructor(opts: DrizzleUsageStoreOptions) {
    this.db = opts.db;
  }

  async today(user_id: string, now: Date = new Date()): Promise<number> {
    const startOfDay = startOfUtcDay(now);
    const rows = await this.db
      .select({
        total: sql<string | null>`sum(${agent_calls.input_tokens} + ${agent_calls.output_tokens})`,
      })
      .from(agent_calls)
      .where(and(eq(agent_calls.user_id, user_id), gte(agent_calls.called_at, startOfDay)));
    const total = rows[0]?.total;
    return total === null || total === undefined ? 0 : Number(total);
  }

  async record(): Promise<void> {
    // intentionally no-op — see class doc
  }
}

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
