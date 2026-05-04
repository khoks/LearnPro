import { asc, eq, lte } from "drizzle-orm";
import { z } from "zod";
import type { LearnProDb } from "./client.js";
import {
  deferred_notifications,
  type DeferredNotification,
  type NewDeferredNotification,
} from "./schema.js";

// STORY-024 — `deferred_notifications` is the never-drop pillar of quiet hours. When the
// dispatcher's `shouldDeliverNow()` hook returns false, we serialize the would-be delivery here
// with a `deliver_after` timestamp computed from `nextDeliveryTime()`. The flusher (cron or
// in-process scheduler) calls `listDueDeferredNotifications` + dispatches each row + deletes it.

// Stored payload mirrors `NotificationInput` from @learnpro/notifications, but inlined here so the
// db package doesn't import from notifications (which already depends on db).
export const DeferredPayloadSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(2000).optional(),
  dedupe_key: z.string().min(1).max(120).optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type DeferredPayload = z.infer<typeof DeferredPayloadSchema>;

export interface InsertDeferredNotificationOptions {
  db: LearnProDb;
  user_id: string;
  org_id?: string;
  payload: DeferredPayload;
  deliver_after: Date;
}

export async function insertDeferredNotification(
  opts: InsertDeferredNotificationOptions,
): Promise<DeferredNotification> {
  const row: NewDeferredNotification = {
    user_id: opts.user_id,
    org_id: opts.org_id ?? "self",
    payload: opts.payload,
    deliver_after: opts.deliver_after,
  };
  const inserted = await opts.db.insert(deferred_notifications).values(row).returning();
  const created = inserted[0];
  if (!created) throw new Error("insertDeferredNotification: insert returned no row");
  return created;
}

export async function listDueDeferredNotifications(
  db: LearnProDb,
  now: Date,
  limit = 100,
): Promise<DeferredNotification[]> {
  return db
    .select()
    .from(deferred_notifications)
    .where(lte(deferred_notifications.deliver_after, now))
    .orderBy(asc(deferred_notifications.deliver_after))
    .limit(limit);
}

export async function deleteDeferredNotification(db: LearnProDb, id: string): Promise<boolean> {
  const result = await db
    .delete(deferred_notifications)
    .where(eq(deferred_notifications.id, id))
    .returning({ id: deferred_notifications.id });
  return result.length > 0;
}
