// STORY-026 — per-user export rate limit.
//
// In-memory single-process limiter — sufficient for the MVP self-hosted single-instance
// deployment that's the only target shape until SaaS lands. A multi-process / multi-replica
// deployment (Fly.io scaled, Kubernetes) needs a Redis-backed shared bucket; that's filed as
// a follow-up Story (see STORY-026 close-out notes). Behavior:
//
// - `tryAcquire(user_id)` returns `{ allowed: true }` when the user's last allow was longer
//   than `windowMs` ago (or they've never been allowed), recording `now()` as the new
//   timestamp. Returns `{ allowed: false, retry_after_seconds: N }` otherwise, where N is
//   the time remaining in the current window, rounded up.
// - `now()` is injectable so tests don't have to wait real wall-clock time.
//
// Memory bound: one timestamp per user_id ever seen. At MVP scale this is bounded by the
// active user count and isn't worth garbage-collecting; once we have hundreds of thousands
// of users a periodic sweep can prune entries older than `windowMs`.
export interface RateLimiter {
  tryAcquire(user_id: string): { allowed: true } | { allowed: false; retry_after_seconds: number };
}

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

  tryAcquire(user_id: string): { allowed: true } | { allowed: false; retry_after_seconds: number } {
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
