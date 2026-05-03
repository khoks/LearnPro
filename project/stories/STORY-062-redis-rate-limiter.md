---
id: STORY-062
title: Redis-backed rate limiter for multi-process / multi-replica deployments
type: story
status: backlog
priority: P2
estimate: S
parent: EPIC-015
phase: v1
tags: [rate-limit, scaling, saas-readiness]
created: 2026-05-03
updated: 2026-05-03
---

## Description

STORY-026 shipped `MemoryRateLimiter` (in-memory single-process) for the per-user data export rate limit. That's correct for the MVP self-hosted single-instance deployment, but the moment we run the API across multiple processes (PM2 cluster, Fly.io scaled replicas, Kubernetes) every replica has its own counter — a determined user could hit `/v1/export` once per replica per window.

This Story ships a Redis-backed `RateLimiter` implementation that shares the per-user timestamp across replicas. The interface (`tryAcquire(user_id) → { allowed: true } | { allowed: false; retry_after_seconds }`) stays identical so the swap is a single-line change in `defaultsFromEnv()`.

## Acceptance criteria

- [ ] `RedisRateLimiter` in `apps/api/src/rate-limiter.ts` (or a new `packages/rate-limit/` if a second consumer materializes) implements the `RateLimiter` interface.
- [ ] Uses Redis SETNX + EXPIRE (or the `SET key value NX EX seconds` one-shot variant) so the operation is atomic — no race condition where two replicas both think they got the slot.
- [ ] Falls back to `MemoryRateLimiter` when `REDIS_URL` isn't set (stays compatible with the self-hosted no-Redis dev path).
- [ ] Integration test against a real Redis (Docker Compose) verifying multi-process behavior: two parallel `tryAcquire(same_user)` calls — exactly one wins.

## Dependencies

- Blocked by: STORY-026 (the `RateLimiter` interface, satisfied 2026-05-03).
- Implies: a `REDIS_URL` env in the deployment guide.

## Notes

- This isn't a hard MVP requirement — single-process is fine until we scale. Listed as P2/v1 so it's filed but not racing for the MVP gate.
- Consider extending to other future rate-limit needs (login attempts, LLM calls per minute, etc.) once a second consumer appears.

## Activity log

- 2026-05-03 — created (filed during STORY-026 close-out)
