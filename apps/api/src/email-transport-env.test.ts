import { describe, expect, it } from "vitest";
import { buildEmailTransportFromEnv } from "./email-transport-env.js";

describe("buildEmailTransportFromEnv (STORY-045 / STORY-045a)", () => {
  it("returns NoopEmailTransport when LEARNPRO_EMAIL_PROVIDER is unset", () => {
    const t = buildEmailTransportFromEnv({ env: {} });
    expect(t.name).toBe("noop");
  });

  it("returns NoopEmailTransport when LEARNPRO_EMAIL_PROVIDER is an unknown value", () => {
    const t = buildEmailTransportFromEnv({ env: { LEARNPRO_EMAIL_PROVIDER: "sendgrid" } });
    expect(t.name).toBe("noop");
  });

  it("returns ResendTransport when LEARNPRO_EMAIL_PROVIDER=resend and RESEND_API_KEY + LEARNPRO_EMAIL_FROM are present", () => {
    const t = buildEmailTransportFromEnv({
      env: {
        LEARNPRO_EMAIL_PROVIDER: "resend",
        RESEND_API_KEY: "re_test",
        LEARNPRO_EMAIL_FROM: "noreply@learnpro.local",
      },
    });
    expect(t.name).toBe("resend");
  });

  it("falls back to NoopEmailTransport (and logs once) when LEARNPRO_EMAIL_PROVIDER=resend but RESEND_API_KEY is missing", () => {
    const logs: string[] = [];
    const t = buildEmailTransportFromEnv({
      env: {
        LEARNPRO_EMAIL_PROVIDER: "resend",
        LEARNPRO_EMAIL_FROM: "noreply@learnpro.local",
      },
      log: (msg) => logs.push(msg),
    });
    expect(t.name).toBe("noop");
    expect(logs.length).toBe(1);
    expect(logs[0]).toMatch(/resend/);
    expect(logs[0]).toMatch(/RESEND_API_KEY/);
  });

  it("falls back to NoopEmailTransport when LEARNPRO_EMAIL_PROVIDER=resend but LEARNPRO_EMAIL_FROM is missing", () => {
    const t = buildEmailTransportFromEnv({
      env: { LEARNPRO_EMAIL_PROVIDER: "resend", RESEND_API_KEY: "re_test" },
    });
    expect(t.name).toBe("noop");
  });

  it("returns PostmarkTransport when LEARNPRO_EMAIL_PROVIDER=postmark and POSTMARK_SERVER_TOKEN + LEARNPRO_EMAIL_FROM are present", () => {
    const t = buildEmailTransportFromEnv({
      env: {
        LEARNPRO_EMAIL_PROVIDER: "postmark",
        POSTMARK_SERVER_TOKEN: "pm_test",
        LEARNPRO_EMAIL_FROM: "noreply@learnpro.local",
      },
    });
    expect(t.name).toBe("postmark");
  });

  it("falls back to NoopEmailTransport (and logs once) when LEARNPRO_EMAIL_PROVIDER=postmark but POSTMARK_SERVER_TOKEN is missing", () => {
    const logs: string[] = [];
    const t = buildEmailTransportFromEnv({
      env: {
        LEARNPRO_EMAIL_PROVIDER: "postmark",
        LEARNPRO_EMAIL_FROM: "noreply@learnpro.local",
      },
      log: (msg) => logs.push(msg),
    });
    expect(t.name).toBe("noop");
    expect(logs.length).toBe(1);
    expect(logs[0]).toMatch(/postmark/);
    expect(logs[0]).toMatch(/POSTMARK_SERVER_TOKEN/);
  });

  it("falls back to NoopEmailTransport when LEARNPRO_EMAIL_PROVIDER=postmark but LEARNPRO_EMAIL_FROM is missing", () => {
    const t = buildEmailTransportFromEnv({
      env: {
        LEARNPRO_EMAIL_PROVIDER: "postmark",
        POSTMARK_SERVER_TOKEN: "pm_test",
      },
    });
    expect(t.name).toBe("noop");
  });

  it("normalises the provider value case-insensitively (POSTMARK / Postmark / PostMark all map to postmark)", () => {
    for (const v of ["POSTMARK", "Postmark", "PostMark"]) {
      const t = buildEmailTransportFromEnv({
        env: {
          LEARNPRO_EMAIL_PROVIDER: v,
          POSTMARK_SERVER_TOKEN: "pm_test",
          LEARNPRO_EMAIL_FROM: "noreply@learnpro.local",
        },
      });
      expect(t.name).toBe("postmark");
    }
  });

  it("normalises the provider value case-insensitively for resend too (RESEND / Resend map to resend)", () => {
    for (const v of ["RESEND", "Resend"]) {
      const t = buildEmailTransportFromEnv({
        env: {
          LEARNPRO_EMAIL_PROVIDER: v,
          RESEND_API_KEY: "re_test",
          LEARNPRO_EMAIL_FROM: "noreply@learnpro.local",
        },
      });
      expect(t.name).toBe("resend");
    }
  });

  it("does not log when no log callback is provided (silent fallback)", () => {
    // The fallback path must not throw or reach for console when no `log` is passed —
    // confirmed by simply not providing one and observing it returns Noop.
    const t = buildEmailTransportFromEnv({
      env: { LEARNPRO_EMAIL_PROVIDER: "postmark" },
    });
    expect(t.name).toBe("noop");
  });
});
