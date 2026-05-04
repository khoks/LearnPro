import { eq } from "drizzle-orm";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type LearnProDb } from "./client.js";
import { runMigrations } from "./migrate.js";
import {
  addWebPushSubscription,
  findRecentDuplicate,
  gcOldNotifications,
  listRecentNotifications,
  listWebPushSubscriptions,
  markAllRead,
  markRead,
  removeWebPushSubscription,
  unreadCount,
} from "./notifications.js";
import { notifications, organizations, users, web_push_subscriptions } from "./schema.js";

const DATABASE_URL = process.env["DATABASE_URL"];

// Integration tests against a real Postgres (Docker Compose). Skipped when DATABASE_URL is unset.
describe.skipIf(!DATABASE_URL)("notifications DB helpers (integration)", () => {
  let db: LearnProDb;
  let pool: Pool;
  let testUserId: string;
  let otherUserId: string;

  beforeAll(async () => {
    const created = createDb({ connectionString: DATABASE_URL ?? "" });
    db = created.db;
    pool = created.pool;
    await runMigrations();
    await db
      .insert(organizations)
      .values({ id: "self", name: "Self-hosted" })
      .onConflictDoNothing();
    const u1 = await db
      .insert(users)
      .values({ email: `notif-test-${Date.now()}@learnpro.local` })
      .returning({ id: users.id });
    const u2 = await db
      .insert(users)
      .values({ email: `notif-other-${Date.now()}@learnpro.local` })
      .returning({ id: users.id });
    const id1 = u1[0]?.id;
    const id2 = u2[0]?.id;
    if (!id1 || !id2) throw new Error("failed to insert test users");
    testUserId = id1;
    otherUserId = id2;
  });

  afterAll(async () => {
    if (db) {
      await db.delete(notifications).where(eq(notifications.user_id, testUserId));
      await db.delete(notifications).where(eq(notifications.user_id, otherUserId));
      await db.delete(web_push_subscriptions).where(eq(web_push_subscriptions.user_id, testUserId));
      await db.delete(users).where(eq(users.id, testUserId));
      await db.delete(users).where(eq(users.id, otherUserId));
    }
    await pool?.end();
  });

  beforeEach(async () => {
    await db.delete(notifications).where(eq(notifications.user_id, testUserId));
    await db.delete(notifications).where(eq(notifications.user_id, otherUserId));
    await db.delete(web_push_subscriptions).where(eq(web_push_subscriptions.user_id, testUserId));
  });

  describe("listRecentNotifications", () => {
    it("returns the user's notifications, descending by sent_at", async () => {
      const t0 = new Date("2026-04-01T10:00:00Z");
      const t1 = new Date("2026-04-02T10:00:00Z");
      const t2 = new Date("2026-04-03T10:00:00Z");
      await db.insert(notifications).values([
        { user_id: testUserId, channel: "in_app", title: "first", sent_at: t0 },
        { user_id: testUserId, channel: "in_app", title: "second", sent_at: t1 },
        { user_id: testUserId, channel: "in_app", title: "third", sent_at: t2 },
      ]);
      const rows = await listRecentNotifications({ db, user_id: testUserId });
      expect(rows.map((r) => r.title)).toEqual(["third", "second", "first"]);
    });

    it("respects the limit", async () => {
      await db.insert(notifications).values(
        Array.from({ length: 5 }, (_, i) => ({
          user_id: testUserId,
          channel: "in_app" as const,
          title: `n${i}`,
        })),
      );
      const rows = await listRecentNotifications({ db, user_id: testUserId, limit: 3 });
      expect(rows).toHaveLength(3);
    });

    it("does not leak other users' notifications", async () => {
      await db
        .insert(notifications)
        .values({ user_id: otherUserId, channel: "in_app", title: "other" });
      const rows = await listRecentNotifications({ db, user_id: testUserId });
      expect(rows).toHaveLength(0);
    });

    it("excludes notifications older than `since`", async () => {
      const old = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
      const recent = new Date();
      await db.insert(notifications).values([
        { user_id: testUserId, channel: "in_app", title: "old", sent_at: old },
        { user_id: testUserId, channel: "in_app", title: "recent", sent_at: recent },
      ]);
      const rows = await listRecentNotifications({
        db,
        user_id: testUserId,
        since: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      });
      expect(rows.map((r) => r.title)).toEqual(["recent"]);
    });
  });

  describe("markRead / markAllRead / unreadCount", () => {
    it("marks one notification as read and returns true", async () => {
      const inserted = await db
        .insert(notifications)
        .values({ user_id: testUserId, channel: "in_app", title: "x" })
        .returning({ id: notifications.id });
      const id = inserted[0]!.id;
      const ok = await markRead({ db, notification_id: id, user_id: testUserId });
      expect(ok).toBe(true);
      const row = await db.select().from(notifications).where(eq(notifications.id, id));
      expect(row[0]!.read_at).not.toBeNull();
    });

    it("returns false when the notification doesn't belong to the caller", async () => {
      const inserted = await db
        .insert(notifications)
        .values({ user_id: otherUserId, channel: "in_app", title: "not yours" })
        .returning({ id: notifications.id });
      const id = inserted[0]!.id;
      const ok = await markRead({ db, notification_id: id, user_id: testUserId });
      expect(ok).toBe(false);
    });

    it("markAllRead flips every unread row + returns the count", async () => {
      await db.insert(notifications).values([
        { user_id: testUserId, channel: "in_app", title: "a" },
        { user_id: testUserId, channel: "in_app", title: "b" },
        { user_id: testUserId, channel: "in_app", title: "c", read_at: new Date() },
      ]);
      const count = await markAllRead({ db, user_id: testUserId });
      expect(count).toBe(2);
      const stillUnread = await unreadCount(db, testUserId);
      expect(stillUnread).toBe(0);
    });

    it("unreadCount returns the number of read_at IS NULL rows for the user", async () => {
      await db.insert(notifications).values([
        { user_id: testUserId, channel: "in_app", title: "a" },
        { user_id: testUserId, channel: "in_app", title: "b" },
        { user_id: testUserId, channel: "in_app", title: "c", read_at: new Date() },
        { user_id: otherUserId, channel: "in_app", title: "other" },
      ]);
      expect(await unreadCount(db, testUserId)).toBe(2);
    });
  });

  describe("web_push_subscriptions helpers", () => {
    it("addWebPushSubscription inserts a row and returns it", async () => {
      const sub = await addWebPushSubscription({
        db,
        user_id: testUserId,
        endpoint: "https://fcm.googleapis.com/fcm/send/abc",
        p256dh: "p256dh-key",
        auth: "auth-key",
      });
      expect(sub.user_id).toBe(testUserId);
      expect(sub.endpoint).toBe("https://fcm.googleapis.com/fcm/send/abc");
    });

    it("addWebPushSubscription is idempotent on endpoint (re-attribute on conflict)", async () => {
      await addWebPushSubscription({
        db,
        user_id: testUserId,
        endpoint: "https://fcm.googleapis.com/fcm/send/dup",
        p256dh: "k1",
        auth: "a1",
      });
      const second = await addWebPushSubscription({
        db,
        user_id: testUserId,
        endpoint: "https://fcm.googleapis.com/fcm/send/dup",
        p256dh: "k2",
        auth: "a2",
      });
      expect(second.p256dh).toBe("k2");
      const all = await listWebPushSubscriptions(db, testUserId);
      expect(all).toHaveLength(1);
    });

    it("removeWebPushSubscription deletes by endpoint and returns true", async () => {
      await addWebPushSubscription({
        db,
        user_id: testUserId,
        endpoint: "https://fcm.googleapis.com/fcm/send/del",
        p256dh: "x",
        auth: "y",
      });
      const removed = await removeWebPushSubscription(
        db,
        "https://fcm.googleapis.com/fcm/send/del",
      );
      expect(removed).toBe(true);
      const empty = await listWebPushSubscriptions(db, testUserId);
      expect(empty).toHaveLength(0);
    });

    it("removeWebPushSubscription returns false when nothing matched", async () => {
      const removed = await removeWebPushSubscription(db, "https://nonexistent");
      expect(removed).toBe(false);
    });

    it("listWebPushSubscriptions returns only the requested user's rows", async () => {
      await addWebPushSubscription({
        db,
        user_id: testUserId,
        endpoint: "https://fcm.googleapis.com/fcm/send/u1",
        p256dh: "x",
        auth: "y",
      });
      await addWebPushSubscription({
        db,
        user_id: otherUserId,
        endpoint: "https://fcm.googleapis.com/fcm/send/u2",
        p256dh: "x",
        auth: "y",
      });
      const own = await listWebPushSubscriptions(db, testUserId);
      expect(own).toHaveLength(1);
      expect(own[0]!.endpoint).toBe("https://fcm.googleapis.com/fcm/send/u1");
      // tidy
      await db
        .delete(web_push_subscriptions)
        .where(eq(web_push_subscriptions.user_id, otherUserId));
    });
  });

  describe("findRecentDuplicate (dedupe_key)", () => {
    it("returns the existing row when the same key was sent inside the window", async () => {
      await db.insert(notifications).values({
        user_id: testUserId,
        channel: "in_app",
        title: "Time to practice",
        dedupe_key: "daily-20260501",
        sent_at: new Date(),
      });
      const dup = await findRecentDuplicate({
        db,
        user_id: testUserId,
        dedupe_key: "daily-20260501",
      });
      expect(dup).not.toBeNull();
      expect(dup?.title).toBe("Time to practice");
    });

    it("returns null when no row matches", async () => {
      const dup = await findRecentDuplicate({
        db,
        user_id: testUserId,
        dedupe_key: "daily-20260501",
      });
      expect(dup).toBeNull();
    });

    it("ignores rows older than the window", async () => {
      const old = new Date(Date.now() - 48 * 60 * 60 * 1000);
      await db.insert(notifications).values({
        user_id: testUserId,
        channel: "in_app",
        title: "Time to practice",
        dedupe_key: "daily-20260501",
        sent_at: old,
      });
      const dup = await findRecentDuplicate({
        db,
        user_id: testUserId,
        dedupe_key: "daily-20260501",
      });
      expect(dup).toBeNull();
    });

    it("does not match across users", async () => {
      await db.insert(notifications).values({
        user_id: otherUserId,
        channel: "in_app",
        title: "x",
        dedupe_key: "daily-20260501",
      });
      const dup = await findRecentDuplicate({
        db,
        user_id: testUserId,
        dedupe_key: "daily-20260501",
      });
      expect(dup).toBeNull();
    });
  });

  describe("gcOldNotifications", () => {
    it("deletes rows older than retention and returns the count", async () => {
      const old = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
      const recent = new Date();
      await db.insert(notifications).values([
        { user_id: testUserId, channel: "in_app", title: "old1", sent_at: old },
        { user_id: testUserId, channel: "in_app", title: "old2", sent_at: old },
        { user_id: testUserId, channel: "in_app", title: "recent", sent_at: recent },
      ]);
      const deleted = await gcOldNotifications(db, 30);
      expect(deleted).toBeGreaterThanOrEqual(2);
      const survivors = await db
        .select()
        .from(notifications)
        .where(eq(notifications.user_id, testUserId));
      expect(survivors.map((r) => r.title)).toContain("recent");
      expect(survivors.map((r) => r.title)).not.toContain("old1");
    });
  });
});
