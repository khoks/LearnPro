import { isInQuietHours, nextDeliveryTime, type QuietHoursConfig } from "@learnpro/scoring";
import {
  NotificationInputSchema,
  type NotificationChannel,
  type NotificationChannelName,
  type NotificationInput,
} from "./channel.js";
import {
  NotificationDispatcher,
  type DispatchOptions,
  type DispatchOutcome,
} from "./dispatcher.js";

// STORY-024 — quiet-hours-aware dispatcher. Composes (not subclasses) `NotificationDispatcher` so
// that a per-dispatch decision tree runs:
//
//   1. parse the input;
//   2. look up the user's quiet-hours config;
//   3. if `isInQuietHours()` → write the payload to the deferred-store with `deliver_after`
//      = `nextDeliveryTime()`, return per-channel `delivered: false reason: "quiet_hours"`;
//   4. else delegate to the inner `NotificationDispatcher.dispatch()`.
//
// The inner dispatcher's own `shouldDeliverNow` is left at its always-deliver default — *we* are
// the quiet-hours gate, the dispatcher just fans out. This avoids the "shouldDeliverNow can't see
// the payload" problem the boolean-only hook signature would create.
//
// Anti-dark-pattern (AC #4): if we report quiet_hours, the deferred row MUST exist (or the defer
// callback was a no-op caller-injected stub). Notifications never get *dropped*, only *deferred*.

// Caller-supplied seam for persisting a deferred delivery. Decoupled from @learnpro/db so this
// package keeps its existing dependency footprint.
export type DeferDeliveryFn = (input: {
  user_id: string;
  payload: Pick<NotificationInput, "title" | "body" | "dedupe_key" | "metadata">;
  deliver_after: Date;
}) => Promise<void>;

export interface DispatcherWithQuietHoursOptions {
  channels: ReadonlyArray<NotificationChannel>;
  // Per-user lookup. Production wires this to `getQuietHoursConfig(db, user_id)` from @learnpro/db.
  getQuietHoursConfig: (user_id: string) => Promise<QuietHoursConfig>;
  // Persists the deferred delivery. Production wires this to `insertDeferredNotification`.
  deferDelivery: DeferDeliveryFn;
  log?: (msg: string, meta?: Record<string, unknown>) => void;
}

// A dispatcher wrapper exposing the same `dispatch()` shape as `NotificationDispatcher`. Tests can
// inject this anywhere a `NotificationDispatcher` is expected — the `dispatch` signature is
// identical.
export class QuietHoursDispatcher {
  private readonly inner: NotificationDispatcher;
  private readonly channels: ReadonlyArray<NotificationChannel>;
  private readonly getQuietHoursConfig: (user_id: string) => Promise<QuietHoursConfig>;
  private readonly deferDelivery: DeferDeliveryFn;
  private readonly log: (msg: string, meta?: Record<string, unknown>) => void;

  constructor(opts: DispatcherWithQuietHoursOptions) {
    this.channels = opts.channels;
    this.getQuietHoursConfig = opts.getQuietHoursConfig;
    this.deferDelivery = opts.deferDelivery;
    this.log = opts.log ?? ((msg, meta) => console.warn(msg, meta ?? {}));
    this.inner = new NotificationDispatcher({
      channels: opts.channels,
      log: this.log,
    });
  }

  async dispatch(raw: NotificationInput, opts: DispatchOptions = {}): Promise<DispatchOutcome> {
    const input = NotificationInputSchema.parse(raw);
    const now = opts.now ?? new Date();
    const config = await this.getQuietHoursConfig(input.user_id);
    if (!isInQuietHours({ config, now })) {
      return this.inner.dispatch(input, opts);
    }
    const deliver_after = nextDeliveryTime({ config, now });
    try {
      await this.deferDelivery({
        user_id: input.user_id,
        payload: extractPayload(input),
        deliver_after,
      });
    } catch (err) {
      // Deferral persistence failed. Per AC #4 we must not silently drop — surface the failure.
      this.log("[QuietHoursDispatcher] deferDelivery failed; not delivering and not deferring", {
        user_id: input.user_id,
        err: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
    const channelNames: NotificationChannelName[] = this.channels.map((c) => c.name);
    return {
      input,
      results: channelNames.map((channel) => ({
        channel,
        delivered: false,
        reason: "quiet_hours",
      })),
      any_delivered: false,
    };
  }
}

// Convenience factory — keeps the public callsite shape `dispatcherWithQuietHours({ ... })` readable.
export function dispatcherWithQuietHours(opts: DispatcherWithQuietHoursOptions): {
  dispatcher: QuietHoursDispatcher;
} {
  return { dispatcher: new QuietHoursDispatcher(opts) };
}

function extractPayload(
  input: NotificationInput,
): Pick<NotificationInput, "title" | "body" | "dedupe_key" | "metadata"> {
  return {
    title: input.title,
    ...(input.body !== undefined && { body: input.body }),
    ...(input.dedupe_key !== undefined && { dedupe_key: input.dedupe_key }),
    ...(input.metadata !== undefined && { metadata: input.metadata }),
  };
}
