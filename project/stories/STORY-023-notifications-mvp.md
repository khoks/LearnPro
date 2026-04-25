---
id: STORY-023
title: In-app notification center + browser Web Push
type: story
status: backlog
priority: P1
estimate: M
parent: EPIC-012
phase: mvp
tags: [notifications, web-push, ui]
created: 2026-04-25
updated: 2026-04-25
---

## Description

A bell icon in the header opens a panel showing recent notifications (history persists). Browser Web Push (VAPID) handles delivery when the app isn't open. All channels go through `NotificationChannel` interface in `packages/notifications` so adding email (v1) and WhatsApp (v2) is mechanical.

**MVP delivers exactly one notification type:** the daily reminder at the user-chosen time. Achievements/level-ups/streak-savers come later — every new notification type adds support cost and we don't add it without a clear job-to-be-done.

## Acceptance criteria

- [ ] Bell icon shows unread count and opens a panel.
- [ ] User can grant Web Push permission and receive a test push.
- [ ] Daily reminder fires at user-chosen time, respecting quiet hours (STORY-024).
- [ ] Notifications persist for 30 days then garbage-collected.
- [ ] Adding a new channel (e.g., email) requires only a new adapter, not changes to calling code.

## Dependencies

- Blocked by: STORY-013 (`notifications` table).

## Tasks

(To be created when work begins.)

## Activity log

- 2026-04-25 — created
