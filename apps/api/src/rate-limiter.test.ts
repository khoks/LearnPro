import { describe, expect, it } from "vitest";
import { MemoryRateLimiter } from "./rate-limiter.js";

describe("MemoryRateLimiter", () => {
  it("first acquire for a user is always allowed", () => {
    const rl = new MemoryRateLimiter({ windowMs: 60_000, now: () => 1_000 });
    expect(rl.tryAcquire("u1")).toEqual({ allowed: true });
  });

  it("second acquire within the window is denied with retry_after_seconds", () => {
    let t = 1_000;
    const rl = new MemoryRateLimiter({ windowMs: 60_000, now: () => t });
    rl.tryAcquire("u1");
    t = 1_000 + 30_000; // 30s later, halfway through the window
    expect(rl.tryAcquire("u1")).toEqual({ allowed: false, retry_after_seconds: 30 });
  });

  it("acquire after the window resets and is allowed", () => {
    let t = 1_000;
    const rl = new MemoryRateLimiter({ windowMs: 60_000, now: () => t });
    rl.tryAcquire("u1");
    t = 1_000 + 60_001; // just past the window
    expect(rl.tryAcquire("u1")).toEqual({ allowed: true });
  });

  it("scopes the window per-user — one user's denial doesn't affect another", () => {
    let t = 1_000;
    const rl = new MemoryRateLimiter({ windowMs: 60_000, now: () => t });
    rl.tryAcquire("u1");
    t = 2_000;
    expect(rl.tryAcquire("u2")).toEqual({ allowed: true });
    expect(rl.tryAcquire("u1").allowed).toBe(false);
  });

  it("rounds up retry_after_seconds (sub-second remaining → 1)", () => {
    let t = 1_000;
    const rl = new MemoryRateLimiter({ windowMs: 60_000, now: () => t });
    rl.tryAcquire("u1");
    t = 1_000 + 59_500; // 500ms left in the window
    const res = rl.tryAcquire("u1");
    expect(res.allowed).toBe(false);
    if (!res.allowed) expect(res.retry_after_seconds).toBe(1);
  });

  it("windowMs=0 → every acquire is allowed (no-op limiter)", () => {
    let t = 1_000;
    const rl = new MemoryRateLimiter({ windowMs: 0, now: () => t });
    expect(rl.tryAcquire("u1").allowed).toBe(true);
    t = 1_001;
    expect(rl.tryAcquire("u1").allowed).toBe(true);
  });

  it("rejects negative windowMs in the constructor", () => {
    expect(() => new MemoryRateLimiter({ windowMs: -1 })).toThrow(/non-negative/);
  });

  it("uses Date.now() by default when no `now` injected", () => {
    const rl = new MemoryRateLimiter({ windowMs: 1_000 });
    expect(rl.tryAcquire("u1").allowed).toBe(true);
    // Immediate re-acquire — should be denied with retry_after_seconds <= 1.
    const second = rl.tryAcquire("u1");
    expect(second.allowed).toBe(false);
    if (!second.allowed) {
      expect(second.retry_after_seconds).toBeGreaterThanOrEqual(1);
      expect(second.retry_after_seconds).toBeLessThanOrEqual(1);
    }
  });
});
