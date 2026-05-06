// STORY-026 — per-user export rate limit.
//
// Two implementations:
//
//   - `MemoryRateLimiter`: in-memory single-process limiter. Sufficient for the MVP
//     self-hosted single-instance deployment that's the only target shape until SaaS lands.
//   - `RedisRateLimiter` (STORY-062): Redis-backed shared-state limiter for multi-process /
//     multi-replica deployments (PM2 cluster, Fly.io scaled, Kubernetes). Atomic SET NX EX
//     prevents two replicas both granting the slot in the same window.
//
// Behavior (both impls):
//
// - `tryAcquire(user_id)` returns `{ allowed: true }` when the user's last allow was longer
//   than `windowMs` ago (or they've never been allowed), recording `now()` as the new
//   timestamp. Returns `{ allowed: false, retry_after_seconds: N }` otherwise, where N is
//   the time remaining in the current window, rounded up.
// - `now()` is injectable so tests don't have to wait real wall-clock time.
//
// Memory bound (MemoryRateLimiter): one timestamp per user_id ever seen. At MVP scale this is
// bounded by the active user count and isn't worth garbage-collecting; once we have hundreds
// of thousands of users a periodic sweep can prune entries older than `windowMs`.
//
// Redis bound (RedisRateLimiter): keys carry an EXPIRE matching the window, so Redis prunes
// them automatically — no GC concerns.
export interface RateLimiter {
  tryAcquire(user_id: string): Promise<RateLimiterDecision> | RateLimiterDecision;
}

export type RateLimiterDecision =
  | { allowed: true }
  | { allowed: false; retry_after_seconds: number };

export interface MemoryRateLimiterOptions {
  windowMs: number;
  now?: () => number;
}

export class MemoryRateLimiter implements RateLimiter {
  private readonly windowMs: number;
  private readonly now: () => number;
  private readonly lastAllowed = new Map<string, number>();

  constructor(opts: MemoryRateLimiterOptions) {
    if (opts.windowMs < 0) {
      throw new Error("MemoryRateLimiter: windowMs must be non-negative");
    }
    this.windowMs = opts.windowMs;
    this.now = opts.now ?? (() => Date.now());
  }

  tryAcquire(user_id: string): RateLimiterDecision {
    const now = this.now();
    const last = this.lastAllowed.get(user_id);
    if (last === undefined || now - last >= this.windowMs) {
      this.lastAllowed.set(user_id, now);
      return { allowed: true };
    }
    const remainingMs = this.windowMs - (now - last);
    return { allowed: false, retry_after_seconds: Math.ceil(remainingMs / 1000) };
  }
}

// Minimal structural interface for the Redis ops we actually need. Lets unit tests inject a
// fake without pulling in ioredis. Production wiring goes through `redisClientAdapter()`
// below, which wraps an ioredis instance and exposes only the operations we use — keeping
// the surface narrow and the swap-without-rewrite contract honest.
//
// setNxEx(key, value, seconds) → "OK" if the key was set (didn't exist), null if it already
//   existed (atomic SET key value EX seconds NX). Two parallel callers always see exactly one
//   "OK" — that's the AC.
// pttl(key) → ms remaining on the key (-2 absent, -1 no TTL).
export interface RedisLikeClient {
  setNxEx(key: string, value: string, seconds: number): Promise<"OK" | null>;
  pttl(key: string): Promise<number>;
}

export interface RedisRateLimiterOptions {
  client: RedisLikeClient;
  windowMs: number;
  // Key prefix so multiple limiters can share a Redis instance without collision. Defaults to
  // `learnpro:rl:export:` which matches the only consumer today (the data-export route).
  keyPrefix?: string;
  now?: () => number;
}

export class RedisRateLimiter implements RateLimiter {
  private readonly client: RedisLikeClient;
  private readonly windowMs: number;
  private readonly keyPrefix: string;
  private readonly now: () => number;

  constructor(opts: RedisRateLimiterOptions) {
    if (opts.windowMs < 0) {
      throw new Error("RedisRateLimiter: windowMs must be non-negative");
    }
    this.client = opts.client;
    this.windowMs = opts.windowMs;
    this.keyPrefix = opts.keyPrefix ?? "learnpro:rl:export:";
    this.now = opts.now ?? (() => Date.now());
  }

  async tryAcquire(user_id: string): Promise<RateLimiterDecision> {
    // windowMs=0 → no rate limit at all (mirrors MemoryRateLimiter's behavior). We skip the
    // round-trip entirely; allowing the call also avoids creating a key with a 0-second TTL
    // (which Redis treats as "no expiry" via DEL — confusing if it ever leaks).
    if (this.windowMs === 0) {
      return { allowed: true };
    }

    const key = `${this.keyPrefix}${user_id}`;
    const seconds = Math.ceil(this.windowMs / 1000);
    // Atomic claim: SET EX NX. Wins return "OK"; losers return null. Two parallel replicas
    // hitting this for the same user are guaranteed exactly one winner — that's the AC.
    const result = await this.client.setNxEx(key, String(this.now()), seconds);
    if (result === "OK") {
      return { allowed: true };
    }

    // Lost the race or already inside an active window. Read the TTL to compute retry_after.
    // PTTL returns -1 (no TTL set) or -2 (key vanished between set and pttl) in degenerate
    // cases — fall back to the full window in seconds so we never report a negative retry.
    const pttl = await this.client.pttl(key);
    const remainingMs = pttl > 0 ? pttl : this.windowMs;
    return { allowed: false, retry_after_seconds: Math.ceil(remainingMs / 1000) };
  }
}

// Minimal surface a real ioredis client (or any compatible client) must expose. We avoid
// importing the ioredis types directly so this module stays loadable in environments where
// ioredis isn't installed (e.g. unit tests that only use FakeRedis).
export interface IoRedisClientLike {
  set(
    key: string,
    value: string,
    secondsToken: "EX",
    seconds: number,
    nx: "NX",
  ): Promise<"OK" | null>;
  pttl(key: string): Promise<number>;
}

// Adapter: wraps an ioredis-like client into the narrow `RedisLikeClient` shape the limiter
// consumes. Lives here so both production wiring (`defaultsFromEnv` in index.ts) and the
// integration test can use it.
export function redisClientAdapter(client: IoRedisClientLike): RedisLikeClient {
  return {
    setNxEx: (key, value, seconds) => client.set(key, value, "EX", seconds, "NX"),
    pttl: (key) => client.pttl(key),
  };
}
