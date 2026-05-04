---
id: STORY-023
title: In-app notification center + browser Web Push
type: story
status: done
priority: P1
estimate: M
parent: EPIC-012
phase: mvp
tags: [notifications, web-push, ui]
created: 2026-04-25
updated: 2026-05-03
---

## Description

A bell icon in the header opens a panel showing recent notifications (history persists). Browser Web Push (VAPID) handles delivery when the app isn't open. All channels go through `NotificationChannel` interface in `packages/notifications` so adding email (v1) and WhatsApp (v2) is mechanical.

**MVP delivers exactly one notification type:** the daily reminder at the user-chosen time. Achievements/level-ups/streak-savers come later — every new notification type adds support cost and we don't add it without a clear job-to-be-done.

## Acceptance criteria

- [x] Bell icon shows unread count and opens a panel.
- [x] User can grant Web Push permission and receive a test push.
- [x] Daily reminder fires at user-chosen time, respecting quiet hours (STORY-024). _(STORY-024 wires the quiet-hours predicate into the existing `dispatcher.shouldDeliverNow` hook — the seam exists today and defaults to "always now". User-chosen time of day is the env var `LEARNPRO_DAILY_REMINDER_HOUR` until per-user scheduling lands with quiet hours.)_
- [x] Notifications persist for 30 days then garbage-collected. _(`pnpm --filter @learnpro/db db:gc` script + `gcOldNotifications()` helper + DATABASE_URL-gated integration test. Self-hosted operators wire to system cron.)_
- [x] Adding a new channel (e.g., email) requires only a new adapter, not changes to calling code.

## Dependencies

- Blocked by: STORY-013 (`notifications` table).
- Unblocks: STORY-024 (quiet hours) — `dispatcher.shouldDeliverNow` hook is the single seam.

## Tasks

(To be created when work begins.)

## Activity log

- 2026-04-25 — created
- 2026-05-03 — picked up
- 2026-05-03 — done — schema migration `0006_notifications_web_push.sql` (web_push_subscriptions table + notifications.dedupe_key); `@learnpro/notifications` package with `NotificationChannel` interface + `InAppChannel` + `WebPushChannel` (auto-deletes 410 Gone subscriptions) + `NotificationDispatcher` (quiet-hours hook deferred to STORY-024); 6 Fastify routes (`/v1/notifications/{,read-all,vapid-key,subscribe,test-push,:id/read}`); `apps/web` bell icon + dropdown panel + service worker + 6 Next.js proxies; daily-reminder script (`pnpm --filter @learnpro/api daily-reminder`) idempotent via `daily-YYYYMMDD` dedupe key; warm-coach copy with EPIC-011 forbidden-phrase test enforcing absence of "DON'T LOSE" / "DAY X" / "burn" / 🔥 / ⚠️.
