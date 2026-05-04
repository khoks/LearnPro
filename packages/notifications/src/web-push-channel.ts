import {
  listWebPushSubscriptions,
  removeWebPushSubscription,
  type LearnProDb,
  type WebPushSubscription,
} from "@learnpro/db";
import type {
  NotificationChannel,
  NotificationChannelName,
  NotificationDeliveryResult,
  NotificationInput,
} from "./channel.js";

// The narrow shape this channel needs from the `web-push` npm package. Defining it here means
// tests can inject a fake without pulling the real package into the test runtime.
export interface WebPushSendError {
  statusCode: number;
  body?: string;
}

export interface WebPushSender {
  sendNotification(
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
    payload: string,
  ): Promise<unknown>;
}

export interface WebPushChannelOptions {
  db: LearnProDb;
  sender: WebPushSender;
  // Optional logger so production can wire `app.log.warn(...)`. Defaults to console.warn.
  log?: (msg: string, meta?: Record<string, unknown>) => void;
}

// Sends to every push subscription on file for the user. A 410 Gone response means the browser
// permanently revoked the subscription — we delete that row so the next dispatch doesn't waste
// a network round-trip on it. Other errors (404, 5xx, network) are logged but the row stays:
// transient outages shouldn't lose subscriptions.
//
// Channel-level success means at least one subscription delivered. If the user has no
// subscriptions, we return `delivered: false, reason: "no_subscriptions"` — non-fatal at the
// dispatcher level.
export class WebPushChannel implements NotificationChannel {
  readonly name: NotificationChannelName = "web_push";
  private readonly db: LearnProDb;
  private readonly sender: WebPushSender;
  private readonly log: (msg: string, meta?: Record<string, unknown>) => void;

  constructor(opts: WebPushChannelOptions) {
    this.db = opts.db;
    this.sender = opts.sender;
    this.log = opts.log ?? ((msg, meta) => console.warn(msg, meta ?? {}));
  }

  async send(input: NotificationInput): Promise<NotificationDeliveryResult> {
    const subs = await listWebPushSubscriptions(this.db, input.user_id);
    if (subs.length === 0) {
      return { delivered: false, reason: "no_subscriptions" };
    }

    const payload = JSON.stringify({
      title: input.title,
      body: input.body ?? "",
      url: typeof input.metadata?.["url"] === "string" ? input.metadata["url"] : "/dashboard",
    });

    let anyDelivered = false;
    let lastReason: string | undefined;

    for (const sub of subs) {
      const result = await this.deliverOne(sub, payload);
      if (result.delivered) anyDelivered = true;
      else lastReason = result.reason;
    }

    if (anyDelivered) return { delivered: true };
    return { delivered: false, reason: lastReason ?? "all_subscriptions_failed" };
  }

  private async deliverOne(
    sub: WebPushSubscription,
    payload: string,
  ): Promise<NotificationDeliveryResult> {
    try {
      await this.sender.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        payload,
      );
      return { delivered: true };
    } catch (err) {
      const statusCode = pickStatus(err);
      // 404 / 410 → Gone. The Push API spec says drop the subscription.
      if (statusCode === 404 || statusCode === 410) {
        try {
          await removeWebPushSubscription(this.db, sub.endpoint);
        } catch (cleanupErr) {
          this.log("[web-push] failed to clean up gone subscription", {
            endpoint: sub.endpoint,
            err: cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr),
          });
        }
        return { delivered: false, reason: `gone_${statusCode}` };
      }
      this.log("[web-push] sendNotification failed", {
        endpoint: sub.endpoint,
        statusCode,
        err: err instanceof Error ? err.message : String(err),
      });
      return { delivered: false, reason: `send_failed_${statusCode ?? "unknown"}` };
    }
  }
}

function pickStatus(err: unknown): number | undefined {
  if (err && typeof err === "object" && "statusCode" in err) {
    const sc = (err as { statusCode: unknown }).statusCode;
    if (typeof sc === "number") return sc;
  }
  return undefined;
}
