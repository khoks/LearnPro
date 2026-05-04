import { z } from "zod";

// STORY-023 — `NotificationChannel` is the contract every delivery surface implements. Adding
// email (STORY-045) or WhatsApp (STORY-050) is mechanical: a new file that exports a class
// satisfying this interface, then wire it into the dispatcher's channel list. No calling code
// changes.

export const NotificationChannelNameSchema = z.enum(["in_app", "web_push", "email", "whatsapp"]);
export type NotificationChannelName = z.infer<typeof NotificationChannelNameSchema>;

export const NotificationInputSchema = z.object({
  user_id: z.string().uuid(),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(2000).optional(),
  // Cron-triggered notifications set this to make double-fires idempotent inside a 24h window.
  // User-triggered notifications (e.g. test push) leave it unset.
  dedupe_key: z.string().min(1).max(120).optional(),
  // Free-form bag forwarded to channels that can use it (web_push uses the `url` field for the
  // notificationclick handler; in-app currently ignores it). Intentionally permissive — adding
  // a field to the schema would gate every channel on its use, which is the wrong default.
  metadata: z.record(z.unknown()).optional(),
});
export type NotificationInput = z.infer<typeof NotificationInputSchema>;

// `delivered=false` is non-fatal — the dispatcher logs `reason` and moves on to the next
// channel. Throwing is reserved for programmer errors (bad config, bad input shape).
export interface NotificationDeliveryResult {
  delivered: boolean;
  reason?: string;
}

export interface NotificationChannel {
  readonly name: NotificationChannelName;
  send(input: NotificationInput): Promise<NotificationDeliveryResult>;
}
