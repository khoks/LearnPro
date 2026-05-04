import type { LearnProDb } from "@learnpro/db";
import { DEFAULT_QUIET_HOURS_CONFIG } from "@learnpro/scoring";
import {
  containsForbiddenPhrase,
  DAILY_REMINDER_BODY,
  DAILY_REMINDER_TITLE,
  dispatcherWithQuietHours,
  NotificationDispatcher,
  type DeferDeliveryFn,
  type NotificationChannel,
  type NotificationInput,
} from "@learnpro/notifications";
import { describe, expect, it, vi } from "vitest";
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

// STORY-024 — verifies the production wiring (`dispatcherWithQuietHours()`-wrapped dispatcher)
// behaves correctly across the timezone boundary the spec calls out:
//   - 23:00 UTC for an LA user (= 16:00 PDT) is OUTSIDE the default 22→08 PT window → delivered
//   - 06:00 UTC for an LA user (= 23:00 PDT) is INSIDE the window → deferred to 15:00 UTC
describe("runDailyReminder — quiet-hours-aware dispatcher (STORY-024)", () => {
  const userId = "11111111-1111-1111-1111-111111111111";

  it("23:00 UTC for an LA user (16:00 PDT) — delivers (outside the default 22→08 PT window)", async () => {
    const db = makeFakeDb([userId]);
    const ch = new CapturingChannel();
    const defer = vi.fn<DeferDeliveryFn>(async () => undefined);
    const { dispatcher } = dispatcherWithQuietHours({
      channels: [ch],
      getQuietHoursConfig: async () => ({
        ...DEFAULT_QUIET_HOURS_CONFIG,
        timezone: "America/Los_Angeles",
      }),
      deferDelivery: defer,
      log: () => {},
    });
    const outcomes = await runDailyReminder({
      db,
      dispatcher,
      now: new Date("2026-05-01T23:00:00Z"),
    });
    expect(outcomes[0]?.any_delivered).toBe(true);
    expect(ch.sent).toHaveLength(1);
    expect(ch.sent[0]?.title).toBe(DAILY_REMINDER_TITLE);
    expect(defer).not.toHaveBeenCalled();
  });

  it("06:00 UTC for an LA user (23:00 PDT) — defers until 15:00 UTC (08:00 PDT next morning)", async () => {
    const db = makeFakeDb([userId]);
    const ch = new CapturingChannel();
    const defer = vi.fn<DeferDeliveryFn>(async () => undefined);
    const { dispatcher } = dispatcherWithQuietHours({
      channels: [ch],
      getQuietHoursConfig: async () => ({
        ...DEFAULT_QUIET_HOURS_CONFIG,
        timezone: "America/Los_Angeles",
      }),
      deferDelivery: defer,
      log: () => {},
    });
    const outcomes = await runDailyReminder({
      db,
      dispatcher,
      now: new Date("2026-05-01T06:00:00Z"),
    });
    expect(outcomes[0]?.any_delivered).toBe(false);
    expect(ch.sent).toHaveLength(0);
    expect(defer).toHaveBeenCalledTimes(1);
    const call = defer.mock.calls[0]![0]!;
    expect(call.user_id).toBe(userId);
    expect(call.payload.title).toBe(DAILY_REMINDER_TITLE);
    expect(call.payload.body).toBe(DAILY_REMINDER_BODY);
    expect(call.deliver_after.toISOString()).toBe("2026-05-01T15:00:00.000Z");
  });
});
