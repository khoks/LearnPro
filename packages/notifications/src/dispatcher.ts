import {
  NotificationInputSchema,
  type NotificationChannel,
  type NotificationChannelName,
  type NotificationDeliveryResult,
  type NotificationInput,
} from "./channel.js";

// Quiet-hours hook — STORY-024 plugs in here. Returning `false` means "not now"; the dispatcher
// records the decision and skips delivery. The default impl is "always now" so MVP behavior is
// unchanged.
export type ShouldDeliverNow = (user_id: string, now: Date) => Promise<boolean> | boolean;

export const ALWAYS_DELIVER: ShouldDeliverNow = () => true;

export interface DispatchOutcome {
  // Same input we received, with `metadata` defaulted to `{}` so callers can index without a guard.
  input: NotificationInput;
  // Per-channel results, in the order channels were configured. Includes "skipped" entries when
  // quiet hours fired or when a channel name was filtered out via the `channels` parameter.
  results: Array<{
    channel: NotificationChannelName;
    delivered: boolean;
    reason?: string;
  }>;
  // True when at least one channel delivered. Cron callers use this to decide whether to log a
  // dispatch as "delivered to user" or as a no-op (quiet hours / no subscriptions / dedupe).
  any_delivered: boolean;
}

export interface DispatchOptions {
  // Limit dispatch to a subset of the configured channels. Useful for the test-push endpoint
  // (web_push only) and for the bell-icon "in-app only" reminders.
  channels?: ReadonlyArray<NotificationChannelName>;
  // Override the wall clock — used by tests and the daily-reminder cron.
  now?: Date;
}

export interface NotificationDispatcherOptions {
  channels: ReadonlyArray<NotificationChannel>;
  shouldDeliverNow?: ShouldDeliverNow;
  log?: (msg: string, meta?: Record<string, unknown>) => void;
}

// Fan-out coordinator. One `dispatch()` call iterates the configured channels in order and
// returns a per-channel result list. The dispatcher itself never throws on a channel error —
// that would let one misbehaving channel block the others. Programmer errors (bad input shape)
// surface as a Zod parse failure before we touch any channel.
export class NotificationDispatcher {
  private readonly channels: ReadonlyArray<NotificationChannel>;
  private readonly shouldDeliverNow: ShouldDeliverNow;
  private readonly log: (msg: string, meta?: Record<string, unknown>) => void;

  constructor(opts: NotificationDispatcherOptions) {
    this.channels = opts.channels;
    this.shouldDeliverNow = opts.shouldDeliverNow ?? ALWAYS_DELIVER;
    this.log = opts.log ?? ((msg, meta) => console.warn(msg, meta ?? {}));
  }

  async dispatch(raw: NotificationInput, opts: DispatchOptions = {}): Promise<DispatchOutcome> {
    const input = NotificationInputSchema.parse(raw);
    const now = opts.now ?? new Date();
    const allow = await this.shouldDeliverNow(input.user_id, now);
    if (!allow) {
      return {
        input,
        results: this.channels.map((c) => ({
          channel: c.name,
          delivered: false,
          reason: "quiet_hours",
        })),
        any_delivered: false,
      };
    }

    const filterSet = opts.channels ? new Set(opts.channels) : null;
    const results: DispatchOutcome["results"] = [];
    let anyDelivered = false;

    for (const channel of this.channels) {
      if (filterSet && !filterSet.has(channel.name)) {
        results.push({ channel: channel.name, delivered: false, reason: "filtered" });
        continue;
      }
      const result = await this.safeSend(channel, input);
      if (result.delivered) anyDelivered = true;
      results.push({ channel: channel.name, ...result });
    }

    return { input, results, any_delivered: anyDelivered };
  }

  private async safeSend(
    channel: NotificationChannel,
    input: NotificationInput,
  ): Promise<NotificationDeliveryResult> {
    try {
      return await channel.send(input);
    } catch (err) {
      this.log(`[dispatcher] channel ${channel.name} threw`, {
        err: err instanceof Error ? err.message : String(err),
      });
      return { delivered: false, reason: "channel_threw" };
    }
  }
}
