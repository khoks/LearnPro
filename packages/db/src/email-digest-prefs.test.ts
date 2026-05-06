import { describe, expect, it } from "vitest";
import {
  DEFAULT_EMAIL_DIGEST_PREFS,
  EmailDigestPrefsSchema,
} from "./email-digest-prefs.js";

// STORY-045 — exercises the pure parts of the helpers that don't need a DB. The DB-dependent
// paths (UPSERT, token-lookup, recipient list) are exercised end-to-end in apps/api integration
// tests against a real Postgres.

describe("EmailDigestPrefsSchema", () => {
  it("accepts a valid config", () => {
    expect(
      EmailDigestPrefsSchema.parse({
        daily_opt_in: true,
        weekly_opt_in: false,
        weekly_day_of_week: 3,
      }),
    ).toEqual({
      daily_opt_in: true,
      weekly_opt_in: false,
      weekly_day_of_week: 3,
    });
  });

  it("rejects weekly_day_of_week outside 1-7", () => {
    expect(() =>
      EmailDigestPrefsSchema.parse({
        daily_opt_in: false,
        weekly_opt_in: false,
        weekly_day_of_week: 0,
      }),
    ).toThrow();
    expect(() =>
      EmailDigestPrefsSchema.parse({
        daily_opt_in: false,
        weekly_opt_in: false,
        weekly_day_of_week: 8,
      }),
    ).toThrow();
  });

  it("rejects non-integer weekly_day_of_week", () => {
    expect(() =>
      EmailDigestPrefsSchema.parse({
        daily_opt_in: false,
        weekly_opt_in: false,
        weekly_day_of_week: 1.5,
      }),
    ).toThrow();
  });

  it("DEFAULT_EMAIL_DIGEST_PREFS is opt-out by default", () => {
    expect(DEFAULT_EMAIL_DIGEST_PREFS.daily_opt_in).toBe(false);
    expect(DEFAULT_EMAIL_DIGEST_PREFS.weekly_opt_in).toBe(false);
    expect(DEFAULT_EMAIL_DIGEST_PREFS.weekly_day_of_week).toBe(1);
  });
});
