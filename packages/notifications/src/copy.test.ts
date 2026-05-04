import { describe, expect, it } from "vitest";
import {
  containsForbiddenPhrase,
  dailyDedupeKey,
  DAILY_REMINDER_BODY,
  DAILY_REMINDER_TITLE,
  FORBIDDEN_PHRASES,
  TEST_PUSH_BODY,
  TEST_PUSH_TITLE,
} from "./copy.js";

// EPIC-011 anti-dark-pattern stance — every default copy string we emit must avoid the
// forbidden set. If anyone changes a default string and reintroduces shame / urgency / fire,
// these tests fail.

describe("default copy: forbidden-phrase scan (EPIC-011 anti-dark-pattern)", () => {
  it("FORBIDDEN_PHRASES at minimum contains DON'T LOSE / DAY X / burn / 🔥 / ⚠️", () => {
    expect(FORBIDDEN_PHRASES).toContain("DON'T LOSE");
    expect(FORBIDDEN_PHRASES).toContain("DAY X");
    expect(FORBIDDEN_PHRASES).toContain("burn");
    expect(FORBIDDEN_PHRASES).toContain("🔥");
    expect(FORBIDDEN_PHRASES).toContain("⚠️");
  });

  it("daily-reminder title is clean", () => {
    expect(containsForbiddenPhrase(DAILY_REMINDER_TITLE)).toBeNull();
  });

  it("daily-reminder body is clean", () => {
    expect(containsForbiddenPhrase(DAILY_REMINDER_BODY)).toBeNull();
  });

  it("test-push title is clean", () => {
    expect(containsForbiddenPhrase(TEST_PUSH_TITLE)).toBeNull();
  });

  it("test-push body is clean", () => {
    expect(containsForbiddenPhrase(TEST_PUSH_BODY)).toBeNull();
  });

  it("containsForbiddenPhrase flags 'burn' case-insensitively", () => {
    expect(containsForbiddenPhrase("don't burn out")).toBe("burn");
    expect(containsForbiddenPhrase("BURN")).toBe("burn");
  });

  it("containsForbiddenPhrase flags fire emoji", () => {
    expect(containsForbiddenPhrase("on a roll 🔥")).toBe("🔥");
  });

  it("containsForbiddenPhrase returns null on coach-voice copy", () => {
    expect(containsForbiddenPhrase("Time to practice")).toBeNull();
    expect(
      containsForbiddenPhrase("A short session keeps your reps warm. Whenever you're ready."),
    ).toBeNull();
  });
});

describe("dailyDedupeKey", () => {
  it("formats UTC YYYYMMDD with daily- prefix", () => {
    expect(dailyDedupeKey(new Date("2026-05-01T00:00:00Z"))).toBe("daily-20260501");
    expect(dailyDedupeKey(new Date("2026-12-31T23:59:00Z"))).toBe("daily-20261231");
    expect(dailyDedupeKey(new Date("2027-01-01T00:00:00Z"))).toBe("daily-20270101");
  });

  it("zero-pads single-digit months and days", () => {
    expect(dailyDedupeKey(new Date("2026-01-09T12:00:00Z"))).toBe("daily-20260109");
  });

  it("two cron fires within the same UTC day produce the same key", () => {
    const morning = new Date("2026-05-01T09:00:00Z");
    const afternoon = new Date("2026-05-01T15:00:00Z");
    expect(dailyDedupeKey(morning)).toBe(dailyDedupeKey(afternoon));
  });

  it("a fire just after UTC midnight rolls to the next day", () => {
    const lateNight = new Date("2026-05-01T23:59:59Z");
    const justAfter = new Date("2026-05-02T00:00:00Z");
    expect(dailyDedupeKey(lateNight)).not.toBe(dailyDedupeKey(justAfter));
    expect(dailyDedupeKey(justAfter)).toBe("daily-20260502");
  });
});
