---
id: STORY-045
title: Email digest notifications (daily + weekly)
type: story
status: backlog
priority: P2
estimate: S
parent: EPIC-012
phase: v1
tags: [notifications, email, digest, v1]
created: 2026-04-25
updated: 2026-04-25
---

## Description

Add email as a `NotificationChannel` adapter. Two digest types:

- **Daily** — "Yesterday: solved 3 problems, mastered list comprehensions, tomorrow's plan is X." Sent at user's preferred reminder time.
- **Weekly** — "This week: closed N concepts, total time M hours, here's your skill snapshot." Sent on user's preferred weekly day.

Opt-in (off by default). Full unsubscribe link. Same anti-FOMO copy rules as Web Push (see [`docs/product/UX_DETAILS.md § EPIC-012`](../../docs/product/UX_DETAILS.md#epic-012--notifications)).

## Acceptance criteria

- [ ] Email channel adapter implemented in `packages/notifications/email/`.
- [ ] Configurable provider — Resend default, Postmark optional.
- [ ] Daily digest template + weekly digest template (MJML or React Email).
- [ ] Opt-in flow in settings (separate per channel: daily / weekly).
- [ ] Unsubscribe link in every email; one-click unsubscribe (RFC 8058 header).
- [ ] Quiet hours respected (digest scheduled outside quiet hours).
- [ ] No marketing copy. Same factual tone as in-app notifications.

## Tasks under this Story

(To be created when this Story is picked up.)

## Dependencies

- Blocked by: EPIC-012 MVP `NotificationChannel` interface (STORY-023).

## Notes

- Self-hosters configure SMTP credentials via env vars (or use Resend's free tier).
- Catalogued in [`docs/vision/RECOMMENDED_ADDITIONS.md`](../../docs/vision/RECOMMENDED_ADDITIONS.md).

## Activity log

- 2026-04-25 — created
