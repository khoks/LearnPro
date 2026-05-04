import { describe, expect, it } from "vitest";
import {
  computeStreak,
  DEFAULT_STREAK_POLICY,
  shouldReplenishGrace,
  utcDayKey,
} from "./streak-policy.js";

// All dates use UTC explicitly. Date.UTC(year, monthIndex, day) returns a UTC ms epoch.
const D = (y: number, m: number, day: number): Date => new Date(Date.UTC(y, m - 1, day));

describe("computeStreak", () => {
  it("returns 0 when the user has never closed an episode", () => {
    const r = computeStreak({ episodeDays: [], today: D(2026, 5, 1), graceDaysRemaining: 2 });
    expect(r).toEqual({ streakDays: 0, graceDaysUsed: 0, graceDaysRemaining: 2 });
  });

  it("counts a single-day streak when today is the only day with an episode", () => {
    const r = computeStreak({
      episodeDays: [D(2026, 5, 1)],
      today: D(2026, 5, 1),
      graceDaysRemaining: 2,
    });
    expect(r.streakDays).toBe(1);
    expect(r.graceDaysUsed).toBe(0);
  });

  it("counts a 5-day consecutive streak ending today", () => {
    const r = computeStreak({
      episodeDays: [D(2026, 5, 1), D(2026, 4, 30), D(2026, 4, 29), D(2026, 4, 28), D(2026, 4, 27)],
      today: D(2026, 5, 1),
      graceDaysRemaining: 2,
    });
    expect(r.streakDays).toBe(5);
    expect(r.graceDaysUsed).toBe(0);
  });

  it("does not require an episode TODAY — streak counts back from yesterday when today is empty", () => {
    // User is checking the dashboard before practicing today. Yesterday + day before each have
    // an episode. The streak should be 2 (yesterday + day before), with no grace used.
    const r = computeStreak({
      episodeDays: [D(2026, 4, 30), D(2026, 4, 29)],
      today: D(2026, 5, 1),
      graceDaysRemaining: 2,
    });
    expect(r.streakDays).toBe(2);
    expect(r.graceDaysUsed).toBe(0);
  });

  it("uses one grace day to bridge a single-day gap when grace is available", () => {
    // Episodes on day 1, day 3 (skipped day 2). 1 grace covers day 2 → streak length 3.
    const r = computeStreak({
      episodeDays: [D(2026, 5, 3), D(2026, 5, 1)],
      today: D(2026, 5, 3),
      graceDaysRemaining: 2,
    });
    expect(r.streakDays).toBe(3);
    expect(r.graceDaysUsed).toBe(1);
    expect(r.graceDaysRemaining).toBe(1);
  });

  it("breaks the streak at the gap when no grace is available", () => {
    const r = computeStreak({
      episodeDays: [D(2026, 5, 3), D(2026, 5, 1)],
      today: D(2026, 5, 3),
      graceDaysRemaining: 0,
    });
    // Today (day 3) counts as 1, then day 2 has no episode and no grace → stop.
    expect(r.streakDays).toBe(1);
    expect(r.graceDaysUsed).toBe(0);
    expect(r.graceDaysRemaining).toBe(0);
  });

  it("breaks the streak when a multi-day gap exceeds the grace budget (graces don't dangle)", () => {
    // Days 5 and 1 — gap of 3 days (days 2, 3, 4). With 2 graces we can bridge at most 2 days,
    // so we'd need to skip day 2 entirely and we never reach the day-1 episode. Graces don't
    // dangle — they only "commit" when they bridge to a real day. So streak = day 5 only = 1,
    // and no grace is consumed (the would-be bridge was abandoned).
    const r = computeStreak({
      episodeDays: [D(2026, 5, 5), D(2026, 5, 1)],
      today: D(2026, 5, 5),
      graceDaysRemaining: 2,
    });
    expect(r.streakDays).toBe(1);
    expect(r.graceDaysUsed).toBe(0);
    expect(r.graceDaysRemaining).toBe(2);
  });

  it("uses both grace days when both are needed", () => {
    // Days 5, 4, 1. Grace bridges days 3 and 2 → streak runs 5, 4, 3, 2, 1 = 5.
    const r = computeStreak({
      episodeDays: [D(2026, 5, 5), D(2026, 5, 4), D(2026, 5, 1)],
      today: D(2026, 5, 5),
      graceDaysRemaining: 2,
    });
    expect(r.streakDays).toBe(5);
    expect(r.graceDaysUsed).toBe(2);
  });

  it("doesn't double-count multiple episodes on the same UTC day", () => {
    // Three episodes all on day 2 → streak = 1 (not 3).
    const r = computeStreak({
      episodeDays: [D(2026, 5, 2), D(2026, 5, 2), D(2026, 5, 2)],
      today: D(2026, 5, 2),
      graceDaysRemaining: 2,
    });
    expect(r.streakDays).toBe(1);
  });

  it("ignores future-dated episodes (defensive — clock skew shouldn't inflate streaks)", () => {
    // Episode "tomorrow" is irrelevant; we walk back from today.
    const r = computeStreak({
      episodeDays: [D(2026, 5, 2), D(2026, 5, 1)],
      today: D(2026, 5, 1),
      graceDaysRemaining: 2,
    });
    expect(r.streakDays).toBe(1);
  });

  it("works across month boundaries (April 30 → May 1)", () => {
    const r = computeStreak({
      episodeDays: [D(2026, 5, 1), D(2026, 4, 30), D(2026, 4, 29)],
      today: D(2026, 5, 1),
      graceDaysRemaining: 2,
    });
    expect(r.streakDays).toBe(3);
    expect(r.graceDaysUsed).toBe(0);
  });

  it("returns the right grace remaining when one is consumed", () => {
    const r = computeStreak({
      episodeDays: [D(2026, 5, 3), D(2026, 5, 1)],
      today: D(2026, 5, 3),
      graceDaysRemaining: 1,
    });
    expect(r.streakDays).toBe(3);
    expect(r.graceDaysUsed).toBe(1);
    expect(r.graceDaysRemaining).toBe(0);
  });

  it("DEFAULT_STREAK_POLICY parses to monthly_grace_days = 2", () => {
    expect(DEFAULT_STREAK_POLICY.monthly_grace_days).toBe(2);
  });
});

describe("shouldReplenishGrace", () => {
  it("returns true when the user has never been replenished (null)", () => {
    expect(shouldReplenishGrace(null, D(2026, 5, 1))).toBe(true);
    expect(shouldReplenishGrace(undefined, D(2026, 5, 1))).toBe(true);
  });

  it("returns false when last replenish was earlier the same month", () => {
    expect(shouldReplenishGrace(D(2026, 5, 1), D(2026, 5, 28))).toBe(false);
  });

  it("returns true when last replenish was in the previous month", () => {
    expect(shouldReplenishGrace(D(2026, 4, 30), D(2026, 5, 1))).toBe(true);
  });

  it("returns true when last replenish was in a previous year", () => {
    expect(shouldReplenishGrace(D(2025, 12, 31), D(2026, 1, 1))).toBe(true);
  });

  it("returns false when last replenish was later (clock skew defensive)", () => {
    expect(shouldReplenishGrace(D(2026, 6, 1), D(2026, 5, 1))).toBe(false);
  });
});

describe("utcDayKey", () => {
  it("formats UTC date as YYYY-MM-DD", () => {
    expect(utcDayKey(D(2026, 5, 1))).toBe("2026-05-01");
    expect(utcDayKey(D(2026, 12, 31))).toBe("2026-12-31");
  });

  it("uses the UTC date even when constructed in another timezone", () => {
    // 2026-04-30T23:30:00Z is still 2026-04-30 in UTC (timezone-agnostic).
    const d = new Date(Date.UTC(2026, 3, 30, 23, 30, 0));
    expect(utcDayKey(d)).toBe("2026-04-30");
  });
});
