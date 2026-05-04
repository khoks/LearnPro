import { findRecentDuplicate, type LearnProDb } from "@learnpro/db";
import { notifications } from "@learnpro/db";
import type {
  NotificationChannel,
  NotificationChannelName,
  NotificationDeliveryResult,
  NotificationInput,
} from "./channel.js";

export interface InAppChannelOptions {
  db: LearnProDb;
  org_id?: string;
  // Window during which a same-key insert is treated as a duplicate. Defaults to 24h.
  dedupe_window_ms?: number;
  // Injectable for tests / cron.
  now?: () => Date;
}

// Always delivers (assuming DB is up). Inserts a row into `notifications`. When the input has
// a `dedupe_key`, an existing matching row inside the dedupe window short-circuits the insert
// and the channel reports `delivered: false, reason: "duplicate"` — the dispatcher treats that
// as a successful no-op (not an error).
export class InAppChannel implements NotificationChannel {
  readonly name: NotificationChannelName = "in_app";
  private readonly db: LearnProDb;
  private readonly org_id: string;
  private readonly dedupeWindowMs: number;
  private readonly now: () => Date;

  constructor(opts: InAppChannelOptions) {
    this.db = opts.db;
    this.org_id = opts.org_id ?? "self";
    this.dedupeWindowMs = opts.dedupe_window_ms ?? 24 * 60 * 60 * 1000;
    this.now = opts.now ?? (() => new Date());
  }

  async send(input: NotificationInput): Promise<NotificationDeliveryResult> {
    if (input.dedupe_key) {
      const existing = await findRecentDuplicate({
        db: this.db,
        user_id: input.user_id,
        dedupe_key: input.dedupe_key,
        window_ms: this.dedupeWindowMs,
        now: this.now(),
      });
      if (existing) {
        return { delivered: false, reason: "duplicate" };
      }
    }

    await this.db.insert(notifications).values({
      org_id: this.org_id,
      user_id: input.user_id,
      channel: "in_app",
      title: input.title,
      ...(input.body !== undefined && { body: input.body }),
      ...(input.dedupe_key !== undefined && { dedupe_key: input.dedupe_key }),
      sent_at: this.now(),
    });

    return { delivered: true };
  }
}
