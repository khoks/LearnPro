import type { LearnProDb } from "@learnpro/db";
import {
  containsForbiddenPhrase,
  DAILY_REMINDER_BODY,
  DAILY_REMINDER_TITLE,
  NotificationDispatcher,
  type NotificationChannel,
  type NotificationInput,
} from "@learnpro/notifications";
import { describe, expect, it } from "vitest";
import { runDailyReminder } from "./daily-reminder.js";

// Stub Drizzle's chainable .select().from().innerJoin().where(). Our daily-reminder query
// returns `{ id }[]`. The `.where(...)` call resolves to that list.
function makeFakeDb(userIds: string[]): LearnProDb {
  return {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: async () => userIds.map((id) => ({ id })),
        }),
      }),
    }),
  } as unknown as LearnProDb;
}

class CapturingChannel implements NotificationChannel {
  readonly name = "in_app" as const;
  public sent: NotificationInput[] = [];
  async send(input: NotificationInput) {
    this.sent.push(input);
    return { delivered: true };
  }
}

describe("runDailyReminder (STORY-023)", () => {
  it("dispatches to every user with a configured time_budget_min", async () => {
    const ids = [
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222",
      "33333333-3333-3333-3333-333333333333",
    ];
    const db = makeFakeDb(ids);
    const ch = new CapturingChannel();
    const dispatcher = new NotificationDispatcher({ channels: [ch], log: () => {} });
    const outcomes = await runDailyReminder({ db, dispatcher });
    expect(outcomes.map((o) => o.user_id)).toEqual(ids);
    expect(ch.sent.map((s) => s.user_id)).toEqual(ids);
  });

  it("uses the warm-coach default copy", async () => {
    const db = makeFakeDb(["11111111-1111-1111-1111-111111111111"]);
    const ch = new CapturingChannel();
    const dispatcher = new NotificationDispatcher({ channels: [ch], log: () => {} });
    await runDailyReminder({ db, dispatcher });
    expect(ch.sent[0]?.title).toBe(DAILY_REMINDER_TITLE);
    expect(ch.sent[0]?.body).toBe(DAILY_REMINDER_BODY);
  });

  it("default copy contains no forbidden dark-pattern phrases", async () => {
    const db = makeFakeDb(["11111111-1111-1111-1111-111111111111"]);
    const ch = new CapturingChannel();
    const dispatcher = new NotificationDispatcher({ channels: [ch], log: () => {} });
    await runDailyReminder({ db, dispatcher });
    const sent = ch.sent[0]!;
    expect(containsForbiddenPhrase(sent.title)).toBeNull();
    expect(containsForbiddenPhrase(sent.body ?? "")).toBeNull();
  });

  it("stamps a daily-YYYYMMDD dedupe_key derived from `now` (UTC)", async () => {
    const db = makeFakeDb(["11111111-1111-1111-1111-111111111111"]);
    const ch = new CapturingChannel();
    const dispatcher = new NotificationDispatcher({ channels: [ch], log: () => {} });
    await runDailyReminder({
      db,
      dispatcher,
      now: new Date("2026-05-01T09:00:00Z"),
    });
    expect(ch.sent[0]?.dedupe_key).toBe("daily-20260501");
  });

  it("two runs in the same UTC day produce the same dedupe_key (cron idempotency seam)", async () => {
    const db = makeFakeDb(["11111111-1111-1111-1111-111111111111"]);
    const ch = new CapturingChannel();
    const dispatcher = new NotificationDispatcher({ channels: [ch], log: () => {} });
    await runDailyReminder({ db, dispatcher, now: new Date("2026-05-01T09:00:00Z") });
    await runDailyReminder({ db, dispatcher, now: new Date("2026-05-01T15:00:00Z") });
    expect(ch.sent.map((s) => s.dedupe_key)).toEqual(["daily-20260501", "daily-20260501"]);
  });

  it("metadata.url points at the dashboard so notificationclick lands somewhere useful", async () => {
    const db = makeFakeDb(["11111111-1111-1111-1111-111111111111"]);
    const ch = new CapturingChannel();
    const dispatcher = new NotificationDispatcher({ channels: [ch], log: () => {} });
    await runDailyReminder({ db, dispatcher });
    expect(ch.sent[0]?.metadata?.["url"]).toBe("/dashboard");
  });

  it("returns an outcome row per user with any_delivered + per-channel results", async () => {
    const db = makeFakeDb(["11111111-1111-1111-1111-111111111111"]);
    const ch = new CapturingChannel();
    const dispatcher = new NotificationDispatcher({ channels: [ch], log: () => {} });
    const outcomes = await runDailyReminder({ db, dispatcher });
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]?.any_delivered).toBe(true);
    expect(outcomes[0]?.per_channel).toEqual([{ channel: "in_app", delivered: true }]);
  });
});
