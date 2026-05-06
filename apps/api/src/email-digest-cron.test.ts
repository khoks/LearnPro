import type { LearnProDb } from "@learnpro/db";
import {
  NotificationDispatcher,
  type NotificationChannel,
  type NotificationInput,
} from "@learnpro/notifications";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  dailyEmailDedupeKey,
  runDailyEmailDigest,
  runWeeklyEmailDigest,
  weeklyEmailDedupeKey,
} from "./email-digest-cron.js";

// STORY-045 — Exercises the cron helpers end-to-end against an in-memory dispatcher with a
// capturing email-channel stub. DB reads are mocked at the @learnpro/db boundary; the helpers
// only call three named functions there.

const listDigestRecipients = vi.fn();
const listFinishedEpisodesInWindow = vi.fn();
const listSkillSnapshot = vi.fn();

vi.mock("@learnpro/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@learnpro/db")>();
  return {
    ...actual,
    listDigestRecipients: (...a: Parameters<typeof actual.listDigestRecipients>) =>
      listDigestRecipients(...a),
    listFinishedEpisodesInWindow: (
      ...a: Parameters<typeof actual.listFinishedEpisodesInWindow>
    ) => listFinishedEpisodesInWindow(...a),
    listSkillSnapshot: (...a: Parameters<typeof actual.listSkillSnapshot>) =>
      listSkillSnapshot(...a),
  };
});

const fakeDb = {} as unknown as LearnProDb;

class CapturingEmailChannel implements NotificationChannel {
  readonly name = "email" as const;
  public sent: NotificationInput[] = [];
  async send(input: NotificationInput) {
    this.sent.push(input);
    return { delivered: true };
  }
}

beforeEach(() => {
  listDigestRecipients.mockReset();
  listFinishedEpisodesInWindow.mockReset();
  listSkillSnapshot.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("dedupe key formatting", () => {
  it("daily key is per-UTC-day", () => {
    expect(dailyEmailDedupeKey(new Date("2026-05-05T09:00:00Z"))).toBe("email-daily-2026-05-05");
    expect(dailyEmailDedupeKey(new Date("2026-05-05T23:59:59Z"))).toBe("email-daily-2026-05-05");
    expect(dailyEmailDedupeKey(new Date("2026-05-06T00:00:00Z"))).toBe("email-daily-2026-05-06");
  });

  it("weekly key is per-UTC-day too (idempotency for a same-day re-run)", () => {
    expect(weeklyEmailDedupeKey(new Date("2026-05-05T09:00:00Z"))).toBe("email-weekly-2026-05-05");
  });
});

describe("runDailyEmailDigest", () => {
  it("dispatches one email per opted-in recipient with the digest html/text in metadata", async () => {
    listDigestRecipients.mockResolvedValue([
      {
        user_id: "11111111-1111-1111-1111-111111111111",
        email: "u1@x.y",
        unsubscribe_token: "tok-u1",
        weekly_day_of_week: 1,
      },
      {
        user_id: "22222222-2222-2222-2222-222222222222",
        email: "u2@x.y",
        unsubscribe_token: "tok-u2",
        weekly_day_of_week: 1,
      },
    ]);
    listFinishedEpisodesInWindow.mockResolvedValue([
      {
        id: "ep1",
        problem_slug: "two-sum",
        problem_name: "Two Sum",
        finished_at: new Date("2026-05-04T18:00:00Z"),
        final_outcome: "passed",
        hints_used: 0,
        time_to_solve_ms: 600_000,
      },
    ]);
    const ch = new CapturingEmailChannel();
    const dispatcher = new NotificationDispatcher({ channels: [ch], log: () => {} });
    const outcomes = await runDailyEmailDigest({
      db: fakeDb,
      dispatcher,
      now: new Date("2026-05-05T07:00:00Z"),
    });
    expect(outcomes).toHaveLength(2);
    expect(ch.sent).toHaveLength(2);
    const sent0 = ch.sent[0]!;
    expect(sent0.title).toBe("Your daily LearnPro digest");
    expect(sent0.metadata?.["email_to"]).toBe("u1@x.y");
    expect(sent0.metadata?.["email_html"]).toContain("Two Sum");
    expect(sent0.metadata?.["email_text"]).toContain("Two Sum");
    expect(sent0.dedupe_key).toBe("email-daily-2026-05-05");
  });

  it("attaches RFC 8058 unsubscribe headers per-user with the user's stable token", async () => {
    listDigestRecipients.mockResolvedValue([
      {
        user_id: "11111111-1111-1111-1111-111111111111",
        email: "u1@x.y",
        unsubscribe_token: "stable-tok-u1",
        weekly_day_of_week: 1,
      },
    ]);
    listFinishedEpisodesInWindow.mockResolvedValue([]);
    const ch = new CapturingEmailChannel();
    const dispatcher = new NotificationDispatcher({ channels: [ch], log: () => {} });
    await runDailyEmailDigest({
      db: fakeDb,
      dispatcher,
      now: new Date("2026-05-05T07:00:00Z"),
      unsubscribeBaseUrl: "https://example.test",
    });
    const sent = ch.sent[0]!;
    const headers = sent.metadata?.["email_headers"] as Record<string, string>;
    expect(headers["List-Unsubscribe"]).toBe(
      "<https://example.test/v1/email/unsubscribe?token=stable-tok-u1>",
    );
    expect(headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });

  it("renders the empty-day body when no episodes finished yesterday", async () => {
    listDigestRecipients.mockResolvedValue([
      {
        user_id: "11111111-1111-1111-1111-111111111111",
        email: "u1@x.y",
        unsubscribe_token: "tok",
        weekly_day_of_week: 1,
      },
    ]);
    listFinishedEpisodesInWindow.mockResolvedValue([]);
    const ch = new CapturingEmailChannel();
    const dispatcher = new NotificationDispatcher({ channels: [ch], log: () => {} });
    await runDailyEmailDigest({
      db: fakeDb,
      dispatcher,
      now: new Date("2026-05-05T07:00:00Z"),
    });
    const text = ch.sent[0]?.metadata?.["email_text"] as string;
    expect(text).toContain("No problems closed yesterday");
  });

  it("forwards today's plan items into the digest", async () => {
    listDigestRecipients.mockResolvedValue([
      {
        user_id: "11111111-1111-1111-1111-111111111111",
        email: "u1@x.y",
        unsubscribe_token: "tok",
        weekly_day_of_week: 1,
      },
    ]);
    listFinishedEpisodesInWindow.mockResolvedValue([]);
    const ch = new CapturingEmailChannel();
    const dispatcher = new NotificationDispatcher({ channels: [ch], log: () => {} });
    await runDailyEmailDigest({
      db: fakeDb,
      dispatcher,
      now: new Date("2026-05-05T07:00:00Z"),
      getTodayPlanItems: async () => [
        { slug: "p1", objective: "Review list comprehensions", estimated_duration_min: 15 },
      ],
    });
    const text = ch.sent[0]?.metadata?.["email_text"] as string;
    expect(text).toContain("Review list comprehensions");
    expect(text).toContain("(~15 min)");
  });

  it("uses getUserName when supplied", async () => {
    listDigestRecipients.mockResolvedValue([
      {
        user_id: "11111111-1111-1111-1111-111111111111",
        email: "u1@x.y",
        unsubscribe_token: "tok",
        weekly_day_of_week: 1,
      },
    ]);
    listFinishedEpisodesInWindow.mockResolvedValue([]);
    const ch = new CapturingEmailChannel();
    const dispatcher = new NotificationDispatcher({ channels: [ch], log: () => {} });
    await runDailyEmailDigest({
      db: fakeDb,
      dispatcher,
      now: new Date("2026-05-05T07:00:00Z"),
      getUserName: async () => "Sam",
    });
    const text = ch.sent[0]?.metadata?.["email_text"] as string;
    expect(text).toContain("Hi Sam,");
  });

  it("returns empty outcomes when no recipients are opted in", async () => {
    listDigestRecipients.mockResolvedValue([]);
    const ch = new CapturingEmailChannel();
    const dispatcher = new NotificationDispatcher({ channels: [ch], log: () => {} });
    const outcomes = await runDailyEmailDigest({
      db: fakeDb,
      dispatcher,
      now: new Date("2026-05-05T07:00:00Z"),
    });
    expect(outcomes).toEqual([]);
    expect(ch.sent).toHaveLength(0);
  });
});

describe("runWeeklyEmailDigest", () => {
  it("filters recipients to those whose preferred ISO weekday matches today", async () => {
    listDigestRecipients.mockResolvedValue([
      {
        user_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        email: "mon@x.y",
        unsubscribe_token: "t-mon",
        weekly_day_of_week: 1,
      },
      {
        user_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        email: "fri@x.y",
        unsubscribe_token: "t-fri",
        weekly_day_of_week: 5,
      },
    ]);
    listFinishedEpisodesInWindow.mockResolvedValue([]);
    listSkillSnapshot.mockResolvedValue([]);
    const ch = new CapturingEmailChannel();
    const dispatcher = new NotificationDispatcher({ channels: [ch], log: () => {} });
    // 2026-05-04 is a Monday (UTC).
    const outcomes = await runWeeklyEmailDigest({
      db: fakeDb,
      dispatcher,
      now: new Date("2026-05-04T07:00:00Z"),
    });
    expect(outcomes.map((o) => o.user_id)).toEqual(["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"]);
  });

  it("Sunday becomes ISO weekday 7 (not 0)", async () => {
    listDigestRecipients.mockResolvedValue([
      {
        user_id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
        email: "sun@x.y",
        unsubscribe_token: "t-sun",
        weekly_day_of_week: 7,
      },
    ]);
    listFinishedEpisodesInWindow.mockResolvedValue([]);
    listSkillSnapshot.mockResolvedValue([]);
    const ch = new CapturingEmailChannel();
    const dispatcher = new NotificationDispatcher({ channels: [ch], log: () => {} });
    // 2026-05-03 is a Sunday (UTC).
    const outcomes = await runWeeklyEmailDigest({
      db: fakeDb,
      dispatcher,
      now: new Date("2026-05-03T07:00:00Z"),
    });
    expect(outcomes.map((o) => o.user_id)).toEqual(["cccccccc-cccc-cccc-cccc-cccccccccccc"]);
  });

  it("attaches mastery deltas + skill snapshot + practice hours", async () => {
    listDigestRecipients.mockResolvedValue([
      {
        user_id: "11111111-1111-1111-1111-111111111111",
        email: "u1@x.y",
        unsubscribe_token: "tok",
        weekly_day_of_week: 1,
      },
    ]);
    listFinishedEpisodesInWindow.mockResolvedValue([
      {
        id: "ep1",
        problem_slug: "two-sum",
        problem_name: "Two Sum",
        finished_at: new Date("2026-05-02T18:00:00Z"),
        final_outcome: "passed",
        hints_used: 0,
        time_to_solve_ms: 1_800_000, // 0.5h
      },
      {
        id: "ep2",
        problem_slug: "list-comp",
        problem_name: "List Comprehensions",
        finished_at: new Date("2026-05-03T18:00:00Z"),
        final_outcome: "passed",
        hints_used: 1,
        time_to_solve_ms: 1_800_000, // 0.5h → 1h total
      },
    ]);
    listSkillSnapshot.mockResolvedValue([
      {
        concept_slug: "loops",
        concept_name: "loops",
        language: "python",
        score: 80,
        confidence: 84,
        last_practiced_at: null,
      },
    ]);
    const ch = new CapturingEmailChannel();
    const dispatcher = new NotificationDispatcher({ channels: [ch], log: () => {} });
    await runWeeklyEmailDigest({
      db: fakeDb,
      dispatcher,
      now: new Date("2026-05-04T07:00:00Z"),
      getMasteryDeltas: async () => [{ concept_name: "loops", delta: 7 }],
    });
    const text = ch.sent[0]?.metadata?.["email_text"] as string;
    expect(text).toContain("Closed 2 problems (2 solved).");
    expect(text).toContain("Total practice time: 1.0 hours.");
    expect(text).toContain("loops (+7 confidence)");
    expect(text).toContain("loops: 84/100");
  });

  it("dispatches with channels filter ['email'] only (skips in-app + web_push)", async () => {
    listDigestRecipients.mockResolvedValue([
      {
        user_id: "11111111-1111-1111-1111-111111111111",
        email: "u1@x.y",
        unsubscribe_token: "tok",
        weekly_day_of_week: 1,
      },
    ]);
    listFinishedEpisodesInWindow.mockResolvedValue([]);
    listSkillSnapshot.mockResolvedValue([]);
    const inApp: NotificationChannel = {
      name: "in_app",
      send: vi.fn().mockResolvedValue({ delivered: true }),
    };
    const email = new CapturingEmailChannel();
    const dispatcher = new NotificationDispatcher({ channels: [inApp, email], log: () => {} });
    await runWeeklyEmailDigest({
      db: fakeDb,
      dispatcher,
      now: new Date("2026-05-04T07:00:00Z"),
    });
    expect(inApp.send).not.toHaveBeenCalled();
    expect(email.sent).toHaveLength(1);
  });
});
