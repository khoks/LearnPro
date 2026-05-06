---
id: STORY-062
title: Redis-backed rate limiter for multi-process / multi-replica deployments
type: story
status: done
priority: P2
estimate: S
parent: EPIC-015
phase: v1
tags: [rate-limit, scaling, saas-readiness]
created: 2026-05-03
updated: 2026-05-06
---

## Description

STORY-026 shipped `MemoryRateLimiter` (in-memory single-process) for the per-user data export rate limit. That's correct for the MVP self-hosted single-instance deployment, but the moment we run the API across multiple processes (PM2 cluster, Fly.io scaled replicas, Kubernetes) every replica has its own counter — a determined user could hit `/v1/export` once per replica per window.

This Story ships a Redis-backed `RateLimiter` implementation that shares the per-user timestamp across replicas. The interface (`tryAcquire(user_id) → { allowed: true } | { allowed: false; retry_after_seconds }`) stays identical so the swap is a single-line change in `defaultsFromEnv()`.

## Acceptance criteria

- [x] `RedisRateLimiter` in `apps/api/src/rate-limiter.ts` (or a new `packages/rate-limit/` if a second consumer materializes) implements the `RateLimiter` interface. — Kept in `apps/api/src/rate-limiter.ts` since there's still a single consumer (the data-export route); ready to move to a `packages/rate-limit/` workspace when a second one shows up.
- [x] Uses Redis SETNX + EXPIRE (or the `SET key value NX EX seconds` one-shot variant) so the operation is atomic — no race condition where two replicas both think they got the slot. — Implemented as `SET key value EX seconds NX` (one-shot variant) via the `setNxEx` adapter method.
- [x] Falls back to `MemoryRateLimiter` when `REDIS_URL` isn't set (stays compatible with the self-hosted no-Redis dev path). — `buildExportRateLimiterFromEnv()` returns undefined when `REDIS_URL` is unset; `buildServer` falls back to `MemoryRateLimiter`.
- [x] Integration test against a real Redis (Docker Compose) verifying multi-process behavior: two parallel `tryAcquire(same_user)` calls — exactly one wins. — `apps/api/src/rate-limiter.integration.test.ts`, gated by `LEARNPRO_REQUIRE_REDIS=1`. 4 tests: 2-parallel race, 16-fanout race, per-user independence, real-Redis EXPIRE roundtrip. Verified locally against `infra/docker/docker-compose.dev.yaml` Redis: 4/4 pass.

## Dependencies

- Blocked by: STORY-026 (the `RateLimiter` interface, satisfied 2026-05-03).
- Implies: a `REDIS_URL` env in the deployment guide.

## Notes

- This isn't a hard MVP requirement — single-process is fine until we scale. Listed as P2/v1 so it's filed but not racing for the MVP gate.
- Consider extending to other future rate-limit needs (login attempts, LLM calls per minute, etc.) once a second consumer appears.

## Activity log

- 2026-05-03 — created (filed during STORY-026 close-out)
- 2026-05-06 — picked up. Plan: keep impl in `apps/api/src/rate-limiter.ts` (no new package — single consumer for now per Story note); add `ioredis` to `@learnpro/api`; integration test gated by `LEARNPRO_REQUIRE_REDIS=1` boots against `redis://localhost:6379` from `infra/docker/docker-compose.dev.yaml`. Default unit test mocks `ioredis` so it's fast and dockerless.
- 2026-05-06 — done. Added `RedisRateLimiter` (atomic `SET key value EX seconds NX`) alongside `MemoryRateLimiter`; widened the `RateLimiter` interface to allow `tryAcquire` to return `Promise<RateLimiterDecision>` (existing sync fakes still satisfy the union); added narrow `RedisLikeClient` shape + `redisClientAdapter()` that wraps an ioredis client (avoids fighting ioredis's overload table). Wired `buildExportRateLimiterFromEnv()` into `defaultsFromEnv()` — uses `lazyConnect: true` so boot stays resilient if Redis is briefly unavailable. 12 new tests: 10 unit (`rate-limiter.test.ts`) + 4 integration (`rate-limiter.integration.test.ts`, `LEARNPRO_REQUIRE_REDIS=1`-gated mirroring the STORY-010 piston pattern) + 2 selection tests in `index.test.ts`. Verified live: 4/4 integration tests pass against `infra/docker/docker-compose.dev.yaml` Redis.
