---
id: STORY-026
title: GDPR-style JSON data export endpoint
type: story
status: backlog
priority: P1
estimate: S
parent: EPIC-002
phase: mvp
tags: [gdpr, export, privacy, saas-readiness]
created: 2026-04-25
updated: 2026-04-25
---

## Description

A `GET /api/export` endpoint returns a JSON dump of everything the system knows about the requesting user: profile, episodes, submissions, agent calls, notifications, settings. Cheap to ship now, expensive to retrofit — and this becomes a hard SaaS-launch requirement under GDPR/CCPA, so building it day 1 is right.

Self-hosted users can hit the endpoint anytime; SaaS will add a UI button + rate limiting later.

## Acceptance criteria

- [ ] `GET /api/export` returns a single JSON object with top-level keys: `profile`, `episodes`, `submissions`, `agent_calls`, `notifications`, `settings`.
- [ ] Auth-gated; only the requesting user's data is returned.
- [ ] Streaming response (no full in-memory buffer) so 10k+ episode users don't OOM.
- [ ] Per-user rate limit: 1 export per hour (configurable).
- [ ] Export is reproducible — re-importing into a fresh instance reconstructs the user's state (export = backup).

## Dependencies

- Blocked by: STORY-013 (schema must exist).

## Tasks

(To be created when work begins.)

## Activity log

- 2026-04-25 — created
