import { describe, expect, it } from "vitest";
import { MemoryRateLimiter, RedisRateLimiter, type RedisLikeClient } from "./rate-limiter.js";

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

// In-memory fake of the SET NX EX + PTTL slice of Redis we depend on. Lets the unit suite
// cover atomic-claim semantics without needing docker, while preserving the same ordering
// guarantees a real single-threaded Redis offers (Promise.resolve queues serially).
class FakeRedis implements RedisLikeClient {
  private readonly store = new Map<string, { value: string; expiresAt: number }>();
  private now: () => number;

  constructor(now: () => number) {
    this.now = now;
  }

  setNow(now: () => number): void {
    this.now = now;
  }

  async setNxEx(key: string, value: string, seconds: number): Promise<"OK" | null> {
    const existing = this.store.get(key);
    if (existing && existing.expiresAt > this.now()) {
      return null;
    }
    this.store.set(key, { value, expiresAt: this.now() + seconds * 1000 });
    return "OK";
  }

  async pttl(key: string): Promise<number> {
    const entry = this.store.get(key);
    if (!entry) return -2;
    const remaining = entry.expiresAt - this.now();
    return remaining > 0 ? remaining : -2;
  }
}

describe("RedisRateLimiter", () => {
  it("first acquire for a user is always allowed", async () => {
    const t = 1_000;
    const rl = new RedisRateLimiter({
      client: new FakeRedis(() => t),
      windowMs: 60_000,
      now: () => t,
    });
    await expect(rl.tryAcquire("u1")).resolves.toEqual({ allowed: true });
  });

  it("second acquire within the window is denied with retry_after_seconds", async () => {
    let t = 1_000;
    const fake = new FakeRedis(() => t);
    const rl = new RedisRateLimiter({ client: fake, windowMs: 60_000, now: () => t });
    await rl.tryAcquire("u1");
    t = 1_000 + 30_000;
    fake.setNow(() => t);
    const res = await rl.tryAcquire("u1");
    expect(res.allowed).toBe(false);
    if (!res.allowed) expect(res.retry_after_seconds).toBe(30);
  });

  it("acquire after the window resets and is allowed", async () => {
    let t = 1_000;
    const fake = new FakeRedis(() => t);
    const rl = new RedisRateLimiter({ client: fake, windowMs: 60_000, now: () => t });
    await rl.tryAcquire("u1");
    t = 1_000 + 60_001;
    fake.setNow(() => t);
    await expect(rl.tryAcquire("u1")).resolves.toEqual({ allowed: true });
  });

  it("scopes the window per-user — one user's denial doesn't affect another", async () => {
    const t = 1_000;
    const fake = new FakeRedis(() => t);
    const rl = new RedisRateLimiter({ client: fake, windowMs: 60_000, now: () => t });
    await rl.tryAcquire("u1");
    await expect(rl.tryAcquire("u2")).resolves.toEqual({ allowed: true });
    const second = await rl.tryAcquire("u1");
    expect(second.allowed).toBe(false);
  });

  it("rounds up retry_after_seconds (sub-second remaining → 1)", async () => {
    let t = 1_000;
    const fake = new FakeRedis(() => t);
    const rl = new RedisRateLimiter({ client: fake, windowMs: 60_000, now: () => t });
    await rl.tryAcquire("u1");
    t = 1_000 + 59_500;
    fake.setNow(() => t);
    const res = await rl.tryAcquire("u1");
    expect(res.allowed).toBe(false);
    if (!res.allowed) expect(res.retry_after_seconds).toBe(1);
  });

  it("windowMs=0 → every acquire is allowed without touching Redis", async () => {
    let setCalls = 0;
    const noopClient: RedisLikeClient = {
      async setNxEx() {
        setCalls += 1;
        return "OK";
      },
      async pttl() {
        return -2;
      },
    };
    const rl = new RedisRateLimiter({ client: noopClient, windowMs: 0 });
    await expect(rl.tryAcquire("u1")).resolves.toEqual({ allowed: true });
    await expect(rl.tryAcquire("u1")).resolves.toEqual({ allowed: true });
    expect(setCalls).toBe(0);
  });

  it("rejects negative windowMs in the constructor", () => {
    const fake = new FakeRedis(() => 0);
    expect(() => new RedisRateLimiter({ client: fake, windowMs: -1 })).toThrow(/non-negative/);
  });

  it("uses SET NX EX exactly once per allow, with seconds = ceil(windowMs/1000)", async () => {
    const calls: Array<{ key: string; value: string; seconds: number }> = [];
    const recordingClient: RedisLikeClient = {
      async setNxEx(key, value, seconds) {
        calls.push({ key, value, seconds });
        return "OK";
      },
      async pttl() {
        return -2;
      },
    };
    const rl = new RedisRateLimiter({
      client: recordingClient,
      windowMs: 60_500,
      keyPrefix: "test:",
      now: () => 4_242,
    });
    await rl.tryAcquire("u-abc");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      key: "test:u-abc",
      value: "4242",
      seconds: 61, // ceil(60500/1000) = 61
    });
  });

  it("falls back to the full window when PTTL returns a non-positive value", async () => {
    // Race: SET returned null (already taken) but the key vanished by the time we read PTTL.
    // The limiter must still report a sane retry_after_seconds rather than negative or zero.
    const flakyClient: RedisLikeClient = {
      async setNxEx() {
        return null;
      },
      async pttl() {
        return -2;
      },
    };
    const rl = new RedisRateLimiter({
      client: flakyClient,
      windowMs: 60_000,
      now: () => 1_000,
    });
    const res = await rl.tryAcquire("u1");
    expect(res.allowed).toBe(false);
    if (!res.allowed) expect(res.retry_after_seconds).toBe(60);
  });

  it("simulates a multi-replica race: two parallel calls — exactly one wins", async () => {
    // The FakeRedis shim is single-threaded async (just like real Redis) — Promise.all
    // serializes the two callers through the JS event loop. The first reaches setNxEx and
    // wins; the second sees the existing key and loses. This is the same atomic-claim
    // contract the integration test verifies against a live Redis.
    const fake = new FakeRedis(() => 1_000);
    const rl = new RedisRateLimiter({ client: fake, windowMs: 60_000, now: () => 1_000 });
    const [a, b] = await Promise.all([rl.tryAcquire("u-race"), rl.tryAcquire("u-race")]);
    const winners = [a, b].filter((r) => r.allowed === true);
    expect(winners).toHaveLength(1);
  });
});
