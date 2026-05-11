---
id: STORY-041a
title: BullMQ trigger for cheatsheet generation (STORY-041 follow-up)
type: story
status: done
priority: P2
estimate: S
parent: EPIC-002
phase: v1-followup
tags: [agent, queue, retention, follow-up]
created: 2026-05-07
updated: 2026-05-11
---

## Description

STORY-041 shipped per-session cheatsheet generation behind a synchronous-on-demand `POST /v1/cheatsheets` route. STORY-033 already established a BullMQ worker pattern (`apps/api/src/profile-insights-cron.ts`) that fires at session-end. This follow-up wires cheatsheet generation onto the same queue so it runs automatically when the tutor closes an episode — alongside the profile-insights synthesis — instead of waiting for the user to click "Generate cheatsheet."

The synchronous POST stays as the operator path for "regenerate manually" and as the dev-without-Redis fallback (matches STORY-033's `REDIS_URL`-unset pattern).

## Acceptance criteria

- [ ] New `cheatsheet` BullMQ queue + worker in `apps/api/src/cheatsheet-cron.ts`, modeled on `profile-insights-cron.ts` (same `buildBullConnectionFromEnv` + Zod-validated payload + `runCheatsheetJob` extracted for unit tests).
- [ ] When the tutor's `finish` route closes an episode, push BOTH a profile-insights job AND a cheatsheet job to the queue. The two side-channels are independently injectable so a misbehaving one can't block the other.
- [ ] The cheatsheet worker calls the existing `cheatsheetAgent` (no new agent logic — just queue plumbing and the existing fetch / persist helpers).
- [ ] When `REDIS_URL` is unset, the trigger logs once and skips (matches STORY-033's pattern; the dev path stays no-Redis-friendly).
- [ ] The synchronous `POST /v1/cheatsheets` route stays — operator path for "regenerate manually" still works.
- [ ] Tests cover: enqueue-on-finish, REDIS_URL-unset skip, worker dispatch, idempotency (cheatsheet already exists for this episode set → skip).

## Tasks under this Story

(Inline; tracked via the activity log on this Story since this is a small follow-up.)

## Dependencies

- Blocked by: [STORY-033](STORY-033-profile-update-agent.md) (BullMQ infra), [STORY-041](STORY-041-cheatsheet-generator.md) (sync POST path + agent + DB helpers).

## Notes

- The cheatsheet worker takes a list of `episode_ids` (not a single episode_id like profile-insights). For the session-end trigger we pass `[episode_id]`; later UI flows can pass multiple.
- Idempotency check via the existing `findCheatsheetForEpisodes(db, user_id, sorted)` helper, mirroring the synchronous route's check.

## Activity log

- 2026-05-07 — created + picked up
