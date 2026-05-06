// STORY-062 — Redis-backed rate limiter integration suite.
//
// Two execution modes, gated by env (mirrors the STORY-010 sandbox-breakout pattern):
//
//   1. Real-Redis mode — `LEARNPRO_REQUIRE_REDIS=1` and `REDIS_URL=<redis://...>`. Boots a
//      live ioredis client, runs the multi-replica race, asserts exactly one tryAcquire
//      wins. Run locally against `infra/docker/docker-compose.dev.yaml`'s Redis service.
//
//   2. Skip mode (default, runs in CI) — the integration block is skipped via vitest's
//      `describe.skipIf`. The unit suite in `rate-limiter.test.ts` covers the same logic
//      against a FakeRedis shim, so coverage doesn't regress without docker.
//
// Why this matters: the AC for STORY-062 is that two parallel tryAcquire calls for the same
// user — the kind of race two API replicas could trigger — must produce exactly one
// `{ allowed: true }` and one `{ allowed: false, retry_after_seconds: ... }`. SET NX EX is
// the atomic primitive we rely on; this test proves it actually behaves that way against a
// real Redis, not just our shim.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Redis } from "ioredis";
import { RedisRateLimiter, redisClientAdapter } from "./rate-limiter.js";

const REQUIRE_REDIS = process.env["LEARNPRO_REQUIRE_REDIS"] === "1";
const REDIS_URL = process.env["REDIS_URL"] ?? "redis://localhost:6379";

describe.skipIf(!REQUIRE_REDIS)("RedisRateLimiter (live)", () => {
  let client: Redis;
  const KEY_PREFIX = `test:rl:${process.pid}:${Date.now()}:`;

  beforeAll(async () => {
    client = new Redis(REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
    await client.connect();
  });

  afterAll(async () => {
    if (client) {
      // Best-effort cleanup so a bad run doesn't leak keys. We scoped the prefix per pid+ts
      // so cross-run pollution is impossible, but tidying up is cheap.
      const keys = await client.keys(`${KEY_PREFIX}*`);
      if (keys.length > 0) await client.del(...keys);
      await client.quit();
    }
  });

  it("two parallel tryAcquire calls for the same user — exactly one wins (multi-replica race)", async () => {
    const rl = new RedisRateLimiter({
      client: redisClientAdapter(client),
      windowMs: 60_000,
      keyPrefix: `${KEY_PREFIX}race:`,
    });

    const [a, b] = await Promise.all([rl.tryAcquire("u-race"), rl.tryAcquire("u-race")]);

    const winners = [a, b].filter((r) => r.allowed === true);
    const losers = [a, b].filter((r) => r.allowed === false);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    const loser = losers[0];
    expect(loser).toBeDefined();
    if (loser && loser.allowed === false) {
      expect(loser.retry_after_seconds).toBeGreaterThan(0);
      expect(loser.retry_after_seconds).toBeLessThanOrEqual(60);
    }
  });

  it("a fanout of N parallel calls — exactly one wins (defense-in-depth for SET NX atomicity)", async () => {
    const rl = new RedisRateLimiter({
      client: redisClientAdapter(client),
      windowMs: 60_000,
      keyPrefix: `${KEY_PREFIX}fanout:`,
    });

    const N = 16;
    const results = await Promise.all(
      Array.from({ length: N }, () => rl.tryAcquire("u-fanout")),
    );
    const winners = results.filter((r) => r.allowed === true);
    expect(winners).toHaveLength(1);
    expect(results).toHaveLength(N);
  });

  it("two different users race independently — each gets exactly one win", async () => {
    const rl = new RedisRateLimiter({
      client: redisClientAdapter(client),
      windowMs: 60_000,
      keyPrefix: `${KEY_PREFIX}per-user:`,
    });

    const [a1, a2, b1, b2] = await Promise.all([
      rl.tryAcquire("alice"),
      rl.tryAcquire("alice"),
      rl.tryAcquire("bob"),
      rl.tryAcquire("bob"),
    ]);

    expect([a1, a2].filter((r) => r.allowed === true)).toHaveLength(1);
    expect([b1, b2].filter((r) => r.allowed === true)).toHaveLength(1);
  });

  it("a second acquire after the window expires is allowed (real-Redis EXPIRE works)", async () => {
    // Use a 1-second window so the test stays fast. We can't speed up Redis's TTL clock — this
    // is the cost of a "real EXPIRE" assertion. Still well under any test timeout.
    const rl = new RedisRateLimiter({
      client: redisClientAdapter(client),
      windowMs: 1_000,
      keyPrefix: `${KEY_PREFIX}expire:`,
    });

    const first = await rl.tryAcquire("u-expire");
    expect(first.allowed).toBe(true);

    const immediate = await rl.tryAcquire("u-expire");
    expect(immediate.allowed).toBe(false);

    await new Promise((r) => setTimeout(r, 1_100));

    const after = await rl.tryAcquire("u-expire");
    expect(after.allowed).toBe(true);
  });
});
