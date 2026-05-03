---
id: STORY-026
title: GDPR-style JSON data export endpoint
type: story
status: done
priority: P1
estimate: S
parent: EPIC-002
phase: mvp
tags: [gdpr, export, privacy, saas-readiness]
created: 2026-04-25
updated: 2026-05-03
---

## Description

A `GET /v1/export` endpoint returns a JSON dump of everything the system knows about the requesting user: profile, episodes, submissions, agent calls, notifications, settings. Cheap to ship now, expensive to retrofit — and this becomes a hard SaaS-launch requirement under GDPR/CCPA, so building it day 1 is right.

Self-hosted users can hit the endpoint anytime; SaaS will add a UI button + rate limiting later.

## Acceptance criteria

- [x] `GET /v1/export` returns a single JSON object with top-level keys: `profile`, `episodes`, `submissions`, `agent_calls`, `notifications`, `settings`. (Path is `/v1/export` to match the existing `/v1/*` family — `/api/export` was the spec sketch; using `/v1/` keeps the routing convention consistent.)
- [x] Auth-gated; only the requesting user's data is returned. Session resolved via the cross-app cookie from STORY-005 (`apps/api/src/session.ts`); 401 when unauthenticated. Submissions are FK-scoped via `episode_id IN (SELECT id FROM episodes WHERE user_id = $1)` rather than a global join, so another user's row can't leak.
- [x] Streaming response (no full in-memory buffer). The pure helper `exportUserData()` in `@learnpro/db` writes the envelope chunk-by-chunk via a `write(chunk)` callback; the Fastify route plumbs it through a Node `Readable` so `Content-Type: application/json` is sent immediately and the body streams as the rows are fetched. Episodes/submissions/agent_calls/notifications are paged (default `page_size: 500`) so 10k-row users stay within bounded memory.
- [x] Per-user rate limit: 1 export per hour (configurable via `LEARNPRO_EXPORT_RATE_LIMIT_HOURS`, default 1). `MemoryRateLimiter` (`apps/api/src/rate-limiter.ts`, <60 LOC) is in-memory + single-process — sufficient for the MVP self-hosted single-instance deployment. Multi-process (Redis-backed) is filed as a follow-up. 429 response includes `retry_after_seconds`.
- [x] Export is reproducible — re-importing into a fresh instance reconstructs the user's state (export = backup). The export *shape* is round-trip-importable: every FK-relevant column is included, timestamps are emitted as ISO-8601 strings, jsonb columns pass through. The companion `importDump()` helper is **deferred to a separate Story** (filed as STORY-061) so the export shape lands without bundling import in scope. See the round-trip-importable comment at the top of `packages/db/src/data-export.ts`.

## Dependencies

- Blocked by: STORY-013 (schema must exist) — satisfied.
- Blocked by: STORY-005 (cross-app session cookie auth) — satisfied.

## Tasks

(Work was done as a single Story-sized landing; no Tasks created.)

## Follow-up Stories filed

- STORY-061 — `importDump()` companion that consumes the export shape and reconstructs a user on a fresh instance. (Out of scope here; the export-shape contract documented in `data-export.ts` is the import-side spec.)
- STORY-062 — Redis-backed export rate limiter for multi-process / multi-replica deployments. (`MemoryRateLimiter` is fine for the MVP single-process target.)

## Activity log

- 2026-04-25 — created
- 2026-05-01 — picked up
- 2026-05-03 — done
