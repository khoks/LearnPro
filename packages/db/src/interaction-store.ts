import type { InteractionStore, StoredInteraction } from "@learnpro/shared";
import type { LearnProDb } from "./client.js";
import { interactions, type NewInteraction } from "./schema.js";

export interface DrizzleInteractionStoreOptions {
  db: LearnProDb;
  org_id?: string;
}

// DB-backed `InteractionStore` — bulk-inserts a batch of interaction events into `interactions`.
//
// Unlike the LLM telemetry sink, batch ingestion is on the **request path** (the API endpoint
// awaits this before responding 200). So we do let DB errors propagate — the client retries.
// A future Story can add a Redis-buffered async variant if writes get hot enough.
//
// All rows in a single batch share the configured `org_id` (defaults to `self`). Per-row org
// scoping happens via the auth middleware that lands in STORY-005; until then we stamp the
// store-level default on every row.
export class DrizzleInteractionStore implements InteractionStore {
  private readonly db: LearnProDb;
  private readonly org_id: string;

  constructor(opts: DrizzleInteractionStoreOptions) {
    this.db = opts.db;
    this.org_id = opts.org_id ?? "self";
  }

  async recordBatch(events: StoredInteraction[]): Promise<void> {
    if (events.length === 0) return;
    const rows: NewInteraction[] = events.map((e) => ({
      org_id: this.org_id,
      type: e.type,
      payload: e.payload,
      t: e.t,
      ...(e.user_id !== null && { user_id: e.user_id }),
      ...(e.episode_id !== null && { episode_id: e.episode_id }),
    }));
    await this.db.insert(interactions).values(rows);
  }
}
