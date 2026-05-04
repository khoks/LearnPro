import { and, desc, eq, gte, isNull, lt } from "drizzle-orm";
import type { LearnProDb } from "./client.js";
import {
  notifications,
  web_push_subscriptions,
  type Notification,
  type WebPushSubscription,
} from "./schema.js";

// STORY-023 — DB helpers for the bell-icon notification panel + Web Push subscription lifecycle.
// Each function takes the drizzle handle as its first arg so callers (apps/api routes, the daily
// reminder cron) can inject either a real DB or a test fake.

export interface ListRecentNotificationsOptions {
  db: LearnProDb;
  user_id: string;
  limit?: number;
  // Floor on `sent_at`. Defaults to 30 days ago — anything older is pruned by `gcOldNotifications`
  // anyway, so the bell-icon list never needs to look further back.
  since?: Date;
}

export async function listRecentNotifications(
  opts: ListRecentNotificationsOptions,
): Promise<Notification[]> {
  const limit = opts.limit ?? 50;
  const since = opts.since ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  return opts.db
    .select()
    .from(notifications)
    .where(and(eq(notifications.user_id, opts.user_id), gte(notifications.sent_at, since)))
    .orderBy(desc(notifications.sent_at))
    .limit(limit);
}

export interface MarkReadOptions {
  db: LearnProDb;
  notification_id: string;
  user_id: string;
  now?: Date;
}

// Returns `true` if a row was updated, `false` if the row didn't exist or didn't belong to the
// caller. The `user_id` predicate is the ownership guard — a malicious user can't mark someone
// else's notification read by guessing UUIDs.
export async function markRead(opts: MarkReadOptions): Promise<boolean> {
  const now = opts.now ?? new Date();
  const result = await opts.db
    .update(notifications)
    .set({ read_at: now })
    .where(
      and(
        eq(notifications.id, opts.notification_id),
        eq(notifications.user_id, opts.user_id),
        isNull(notifications.read_at),
      ),
    )
    .returning({ id: notifications.id });
  return result.length > 0;
}

export interface MarkAllReadOptions {
  db: LearnProDb;
  user_id: string;
  now?: Date;
}

// Returns the count of rows that flipped from unread → read. Already-read rows are skipped via
// the `read_at IS NULL` predicate so the count is accurate.
export async function markAllRead(opts: MarkAllReadOptions): Promise<number> {
  const now = opts.now ?? new Date();
  const result = await opts.db
    .update(notifications)
    .set({ read_at: now })
    .where(and(eq(notifications.user_id, opts.user_id), isNull(notifications.read_at)))
    .returning({ id: notifications.id });
  return result.length;
}

export async function unreadCount(db: LearnProDb, user_id: string): Promise<number> {
  const rows = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(eq(notifications.user_id, user_id), isNull(notifications.read_at)));
  return rows.length;
}

export interface AddWebPushSubscriptionOptions {
  db: LearnProDb;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  org_id?: string;
}

// Idempotent insert keyed on `endpoint`. If the same endpoint already exists for a different
// user we re-attribute it to the new user (browsers can sign in/out under one push subscription).
// Returns the canonical row.
export async function addWebPushSubscription(
  opts: AddWebPushSubscriptionOptions,
): Promise<WebPushSubscription> {
  const org_id = opts.org_id ?? "self";
  const inserted = await opts.db
    .insert(web_push_subscriptions)
    .values({
      org_id,
      user_id: opts.user_id,
      endpoint: opts.endpoint,
      p256dh: opts.p256dh,
      auth: opts.auth,
    })
    .onConflictDoUpdate({
      target: web_push_subscriptions.endpoint,
      set: {
        user_id: opts.user_id,
        p256dh: opts.p256dh,
        auth: opts.auth,
      },
    })
    .returning();
  const row = inserted[0];
  if (!row) throw new Error("addWebPushSubscription: insert returned no row");
  return row;
}

export async function removeWebPushSubscription(
  db: LearnProDb,
  endpoint: string,
): Promise<boolean> {
  const result = await db
    .delete(web_push_subscriptions)
    .where(eq(web_push_subscriptions.endpoint, endpoint))
    .returning({ id: web_push_subscriptions.id });
  return result.length > 0;
}

export async function listWebPushSubscriptions(
  db: LearnProDb,
  user_id: string,
): Promise<WebPushSubscription[]> {
  return db
    .select()
    .from(web_push_subscriptions)
    .where(eq(web_push_subscriptions.user_id, user_id));
}

export interface FindRecentDuplicateOptions {
  db: LearnProDb;
  user_id: string;
  dedupe_key: string;
  // Window during which a same-key insert is treated as a duplicate. Defaults to 24h to cover the
  // daily-reminder cron firing twice in the same UTC day.
  window_ms?: number;
  now?: Date;
}

// Used by the in-app channel before insert. Returns the existing row if one was sent inside the
// window with the same dedupe_key — null otherwise.
export async function findRecentDuplicate(
  opts: FindRecentDuplicateOptions,
): Promise<Notification | null> {
  const windowMs = opts.window_ms ?? 24 * 60 * 60 * 1000;
  const now = opts.now ?? new Date();
  const since = new Date(now.getTime() - windowMs);
  const rows = await opts.db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.user_id, opts.user_id),
        eq(notifications.dedupe_key, opts.dedupe_key),
        gte(notifications.sent_at, since),
      ),
    )
    .orderBy(desc(notifications.sent_at))
    .limit(1);
  return rows[0] ?? null;
}

// Daily-job target. Returns the count of deleted rows so callers can log it.
export async function gcOldNotifications(db: LearnProDb, retention_days = 30): Promise<number> {
  const cutoff = new Date(Date.now() - retention_days * 24 * 60 * 60 * 1000);
  const result = await db
    .delete(notifications)
    .where(lt(notifications.sent_at, cutoff))
    .returning({ id: notifications.id });
  return result.length;
}
