---
id: STORY-024
title: User-configurable quiet hours
type: story
status: done
priority: P1
estimate: XS
parent: EPIC-012
phase: mvp
tags: [notifications, quiet-hours, settings]
created: 2026-04-25
updated: 2026-05-01
---

## Description

A simple settings toggle: "Don't send pushes between [22:00] and [08:00] local time." Default is on. The notification dispatcher checks the user's quiet-hours config + their detected timezone before delivering any push.

If a notification is scheduled inside quiet hours, it's deferred to the end of the quiet window — not silently dropped.

## Acceptance criteria

- [x] Settings page exposes start/end time pickers.
- [x] Default values are 22:00 and 08:00 in the user's timezone.
- [x] Notification dispatcher respects the window for all channels (not just push).
- [x] Deferred notifications are delivered at the end of the window, not lost.

## Dependencies

- Blocked by: STORY-023 (notification dispatcher).

## Tasks

(To be created when work begins.)

## Activity log

- 2026-04-25 — created
- 2026-05-01 — picked up
- 2026-05-01 — done. New profile columns (`quiet_hours_enabled` / `quiet_hours_start_min` / `quiet_hours_end_min` / `timezone`) + `deferred_notifications` table (migration `0009_quiet_hours.sql`). Pure `isInQuietHours` + `nextDeliveryTime` policy in `@learnpro/scoring` — DST-aware via `Intl.DateTimeFormat`-derived offsets. New `QuietHoursDispatcher` (factory `dispatcherWithQuietHours`) wraps `NotificationDispatcher`; on in-window dispatch, writes the payload to `deferred_notifications` with `deliver_after = nextDeliveryTime()` and reports per-channel `quiet_hours`. `processDeferredNotifications()` flusher drains the table when the window opens (idempotent + LIMIT 100). 2 settings routes (`GET / PUT /v1/settings/quiet-hours`) + Next.js proxies + `<QuietHoursCard>` UI on the dashboard. Daily-reminder cron uses the wrapped dispatcher in production. Coach-voice copy + forbidden-phrase test enforces anti-dark-pattern stance. Notifications **deferred, never dropped** (AC #4). ~66 new tests across `quiet-hours.test.ts` (scoring, 28), `dispatcher-factory.test.ts` (13), `deferred-flusher.test.ts` (7), `quiet-hours.test.ts` (db, 5 DATABASE_URL-gated), `quiet-hours.test.ts` (api, 6), `daily-reminder.test.ts` (+2), `QuietHoursCard.test.tsx` (5), `schema.test.ts` (+6).
