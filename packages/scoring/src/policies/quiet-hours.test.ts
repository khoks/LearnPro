import { describe, expect, it } from "vitest";
import {
  DEFAULT_QUIET_HOURS_CONFIG,
  isInQuietHours,
  nextDeliveryTime,
  QuietHoursConfigSchema,
  type QuietHoursConfig,
} from "./quiet-hours.js";

// STORY-024 — pure quiet-hours policy tests. No DB, no Intl tricks beyond what the runtime ships.
// All times use fixed UTC instants paired with target IANA zones so the tests are deterministic
// across CI runners.

const cfg = (overrides: Partial<QuietHoursConfig> = {}): QuietHoursConfig => ({
  ...DEFAULT_QUIET_HOURS_CONFIG,
  ...overrides,
});

describe("QuietHoursConfigSchema", () => {
  it("accepts the documented default 22:00 → 08:00 UTC", () => {
    const parsed = QuietHoursConfigSchema.parse({
      enabled: true,
      start_min: 1320,
      end_min: 480,
      timezone: "UTC",
    });
    expect(parsed.start_min).toBe(1320);
    expect(parsed.end_min).toBe(480);
  });

  it("rejects start_min === end_min (zero-width window)", () => {
    expect(() =>
      QuietHoursConfigSchema.parse({
        enabled: true,
        start_min: 600,
        end_min: 600,
        timezone: "UTC",
      }),
    ).toThrow();
  });

  it("rejects out-of-range minute values (≥ 1440)", () => {
    expect(() =>
      QuietHoursConfigSchema.parse({
        enabled: true,
        start_min: 1440,
        end_min: 480,
        timezone: "UTC",
      }),
    ).toThrow();
  });

  it("rejects an unknown IANA timezone", () => {
    expect(() =>
      QuietHoursConfigSchema.parse({
        enabled: true,
        start_min: 1320,
        end_min: 480,
        timezone: "Mars/Olympus_Mons",
      }),
    ).toThrow();
  });

  it("accepts a valid named zone like America/Los_Angeles", () => {
    const parsed = QuietHoursConfigSchema.parse({
      enabled: true,
      start_min: 1320,
      end_min: 480,
      timezone: "America/Los_Angeles",
    });
    expect(parsed.timezone).toBe("America/Los_Angeles");
  });
});

describe("isInQuietHours — disabled short-circuit", () => {
  it("returns false when enabled === false, regardless of clock", () => {
    const config = cfg({ enabled: false });
    expect(isInQuietHours({ config, now: new Date("2026-05-01T23:00:00Z") })).toBe(false);
    expect(isInQuietHours({ config, now: new Date("2026-05-01T03:00:00Z") })).toBe(false);
  });
});

describe("isInQuietHours — simple window (no wrap, e.g. 13:00 → 14:00 UTC)", () => {
  const config = cfg({ start_min: 13 * 60, end_min: 14 * 60 });

  it("at exactly start, in-window (boundary inclusive on the start side)", () => {
    expect(isInQuietHours({ config, now: new Date("2026-05-01T13:00:00Z") })).toBe(true);
  });

  it("inside the window", () => {
    expect(isInQuietHours({ config, now: new Date("2026-05-01T13:30:00Z") })).toBe(true);
  });

  it("at exactly end, OUT-of-window (boundary exclusive on the end side)", () => {
    expect(isInQuietHours({ config, now: new Date("2026-05-01T14:00:00Z") })).toBe(false);
  });

  it("outside the window (before start)", () => {
    expect(isInQuietHours({ config, now: new Date("2026-05-01T12:30:00Z") })).toBe(false);
  });
});

describe("isInQuietHours — wrap-around (22:00 → 08:00 UTC)", () => {
  const config = cfg({ start_min: 22 * 60, end_min: 8 * 60 });

  it("23:00 UTC — late-night, in-window", () => {
    expect(isInQuietHours({ config, now: new Date("2026-05-01T23:00:00Z") })).toBe(true);
  });

  it("03:00 UTC — early-morning, in-window (after midnight wrap)", () => {
    expect(isInQuietHours({ config, now: new Date("2026-05-02T03:00:00Z") })).toBe(true);
  });

  it("at exactly 22:00 UTC, in-window", () => {
    expect(isInQuietHours({ config, now: new Date("2026-05-01T22:00:00Z") })).toBe(true);
  });

  it("at exactly 08:00 UTC, OUT-of-window", () => {
    expect(isInQuietHours({ config, now: new Date("2026-05-02T08:00:00Z") })).toBe(false);
  });

  it("noon — outside the window", () => {
    expect(isInQuietHours({ config, now: new Date("2026-05-01T12:00:00Z") })).toBe(false);
  });
});

describe("isInQuietHours — non-UTC timezone (America/Los_Angeles, default 22→08 PT)", () => {
  // PDT is UTC−7. So 22:00 PDT = 05:00 UTC next day. 08:00 PDT = 15:00 UTC same day.
  const config = cfg({ timezone: "America/Los_Angeles" });

  it("06:00 UTC = 23:00 PDT (May, DST active) — in-window", () => {
    expect(isInQuietHours({ config, now: new Date("2026-05-01T06:00:00Z") })).toBe(true);
  });

  it("14:00 UTC = 07:00 PDT — in-window (still pre-08:00 local)", () => {
    expect(isInQuietHours({ config, now: new Date("2026-05-01T14:00:00Z") })).toBe(true);
  });

  it("16:00 UTC = 09:00 PDT — outside the window", () => {
    expect(isInQuietHours({ config, now: new Date("2026-05-01T16:00:00Z") })).toBe(false);
  });

  it("23:00 UTC = 16:00 PDT — outside the window", () => {
    expect(isInQuietHours({ config, now: new Date("2026-05-01T23:00:00Z") })).toBe(false);
  });
});

describe("isInQuietHours — DST-transition days", () => {
  // US DST starts second Sunday in March. 2026: March 8. PT shifts UTC−8 (PST) → UTC−7 (PDT) at
  // 02:00 local time. The 02:00 hour itself is *skipped*. Between 02:00 PST and 09:00 UTC (which is
  // 02:00 PDT after the jump), the local clock skips ahead by an hour.
  it("spring-forward day, 11:00 UTC = 04:00 PDT — still inside the 22→08 PDT window", () => {
    const config = cfg({ timezone: "America/Los_Angeles" });
    expect(isInQuietHours({ config, now: new Date("2026-03-08T11:00:00Z") })).toBe(true);
  });

  it("spring-forward day, 16:00 UTC = 09:00 PDT — outside the window (post-08:00 local)", () => {
    const config = cfg({ timezone: "America/Los_Angeles" });
    expect(isInQuietHours({ config, now: new Date("2026-03-08T16:00:00Z") })).toBe(false);
  });

  // Fall-back: November 1, 2026 — clocks fall back from 02:00 PDT to 01:00 PST. 09:00 UTC
  // straddles the transition; in PST (after fallback) it's 01:00 — still inside 22→08 quiet hours.
  it("fall-back day, 09:00 UTC = 01:00 PST (post-fallback) — in-window", () => {
    const config = cfg({ timezone: "America/Los_Angeles" });
    expect(isInQuietHours({ config, now: new Date("2026-11-01T09:00:00Z") })).toBe(true);
  });
});

describe("nextDeliveryTime", () => {
  it("returns `now` unchanged when enabled === false", () => {
    const config = cfg({ enabled: false });
    const now = new Date("2026-05-01T23:00:00Z");
    expect(nextDeliveryTime({ config, now }).getTime()).toBe(now.getTime());
  });

  it("returns `now` unchanged when outside the window", () => {
    const config = cfg();
    const now = new Date("2026-05-01T15:00:00Z");
    expect(nextDeliveryTime({ config, now }).getTime()).toBe(now.getTime());
  });

  it("returns the next 08:00 UTC when called inside the default 22→08 UTC window", () => {
    const config = cfg();
    const now = new Date("2026-05-01T23:00:00Z");
    const expected = new Date("2026-05-02T08:00:00Z");
    expect(nextDeliveryTime({ config, now }).getTime()).toBe(expected.getTime());
  });

  it("at start-edge, returns the SAME-day end (08:00 the next day)", () => {
    const config = cfg();
    const now = new Date("2026-05-01T22:00:00Z");
    const expected = new Date("2026-05-02T08:00:00Z");
    expect(nextDeliveryTime({ config, now }).getTime()).toBe(expected.getTime());
  });

  it("for America/Los_Angeles, defers a 06:00-UTC call until 15:00 UTC same day (08:00 PDT)", () => {
    // 06:00 UTC = 23:00 PDT (still 22→08 quiet hours). End is 08:00 PDT = 15:00 UTC same day.
    const config = cfg({ timezone: "America/Los_Angeles" });
    const now = new Date("2026-05-01T06:00:00Z");
    const expected = new Date("2026-05-01T15:00:00Z");
    expect(nextDeliveryTime({ config, now }).getTime()).toBe(expected.getTime());
  });

  it("non-wrap window (13:00 → 14:00 UTC): 13:30 → 14:00 UTC", () => {
    const config = cfg({ start_min: 13 * 60, end_min: 14 * 60 });
    const now = new Date("2026-05-01T13:30:00Z");
    const expected = new Date("2026-05-01T14:00:00Z");
    expect(nextDeliveryTime({ config, now }).getTime()).toBe(expected.getTime());
  });
});
