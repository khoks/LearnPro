import { describe, expect, it } from "vitest";
import { isTransient, withRetry } from "./retry.js";

describe("isTransient", () => {
  it("treats 429 / 500-class as transient", () => {
    expect(isTransient({ status: 429 })).toBe(true);
    expect(isTransient({ status: 503 })).toBe(true);
    expect(isTransient({ status: 502 })).toBe(true);
  });

  it("does not retry client errors", () => {
    expect(isTransient({ status: 400 })).toBe(false);
    expect(isTransient({ status: 401 })).toBe(false);
    expect(isTransient({ status: 404 })).toBe(false);
  });

  it("treats common network error codes as transient", () => {
    expect(isTransient({ code: "ECONNRESET" })).toBe(true);
    expect(isTransient({ code: "ETIMEDOUT" })).toBe(true);
    expect(isTransient({ code: "ENOTSUP" })).toBe(false);
  });
});

describe("withRetry", () => {
  it("returns the value on first try", async () => {
    const out = await withRetry(async () => 42, {
      attempts: 3,
      base_ms: 1,
      max_ms: 1,
      sleep: async () => {},
    });
    expect(out).toBe(42);
  });

  it("retries until success and stops after attempts exhausted", async () => {
    let calls = 0;
    const out = await withRetry(
      async () => {
        calls++;
        if (calls < 3) {
          const err = new Error("flaky") as Error & { status: number };
          err.status = 503;
          throw err;
        }
        return "ok";
      },
      { attempts: 5, base_ms: 1, max_ms: 1, sleep: async () => {} },
    );
    expect(out).toBe("ok");
    expect(calls).toBe(3);
  });

  it("does not retry non-transient errors", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          const err = new Error("nope") as Error & { status: number };
          err.status = 400;
          throw err;
        },
        { attempts: 5, base_ms: 1, max_ms: 1, sleep: async () => {} },
      ),
    ).rejects.toThrow("nope");
    expect(calls).toBe(1);
  });
});
