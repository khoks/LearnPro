---
id: STORY-024
title: User-configurable quiet hours
type: story
status: backlog
priority: P1
estimate: XS
parent: EPIC-012
phase: mvp
tags: [notifications, quiet-hours, settings]
created: 2026-04-25
updated: 2026-04-25
---

## Description

A simple settings toggle: "Don't send pushes between [22:00] and [08:00] local time." Default is on. The notification dispatcher checks the user's quiet-hours config + their detected timezone before delivering any push.

If a notification is scheduled inside quiet hours, it's deferred to the end of the quiet window — not silently dropped.

## Acceptance criteria

- [ ] Settings page exposes start/end time pickers.
- [ ] Default values are 22:00 and 08:00 in the user's timezone.
- [ ] Notification dispatcher respects the window for all channels (not just push).
- [ ] Deferred notifications are delivered at the end of the window, not lost.

## Dependencies

- Blocked by: STORY-023 (notification dispatcher).

## Tasks

(To be created when work begins.)

## Activity log

- 2026-04-25 — created
