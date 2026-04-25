---
id: EPIC-012
title: Notifications (in-app, push, email, WhatsApp)
type: epic
status: backlog
priority: P1
phase: mvp
tags: [notifications, push, email, whatsapp]
created: 2026-04-25
updated: 2026-04-25
---

## Goal

Help users keep practice momentum with respectful nudges across channels. Channels are added behind a `NotificationChannel` interface so adding email or WhatsApp later doesn't ripple through the codebase.

## Scope

**MVP:**
- `NotificationChannel` interface in `packages/notifications`.
- In-app notification center (bell icon + history).
- Browser Web Push (VAPID).
- User-configurable quiet hours (default 22:00–08:00 local).
- Single daily reminder at user-chosen time, dismissible.

**v1+:**
- Email digests (daily / weekly) via Resend or Postmark.

**v2+:**
- WhatsApp via Meta Cloud API (lowest cost; Twilio for SMS only later).
- Smart re-engagement based on a decay model (pairs with FSRS), not blanket schedules.

**v3+:**
- SMS fallback.

## Out of scope

- Marketing emails (separate concern).
- In-app modal popups for "new feature" announcements (we don't do that).
- Any notification that uses urgency / FOMO language.

## Stories under this Epic

- STORY-023 — In-app notification center + Web Push (MVP)
- STORY-024 — User-configurable quiet hours (MVP)

## Exit criteria (MVP)

- [ ] User can grant Web Push permission and receive their daily reminder.
- [ ] Quiet hours are respected (no push delivered between configured times).
- [ ] Channel preferences persist across sessions.
- [ ] Adding the email channel later requires only a new adapter, not changes to calling code.

## Related

- Vision: [`docs/vision/GROOMED_FEATURES.md`](../../docs/vision/GROOMED_FEATURES.md) § Theme 9

## Design notes & alternatives

See [`docs/product/UX_DETAILS.md § EPIC-012`](../../docs/product/UX_DETAILS.md#epic-012--notifications) for the full deep-dive, including a copy DO/DON'T table with concrete examples.

Key locked decisions for this Epic:
- **MVP notification types**: daily reminder (Web Push, quiet-hours-respected), session abandoned (in-app only), tutor offline/back (in-app), daily budget reached (in-app), grace day used (in-app + Web Push), concept mastered (in-app, small celebration).
- **Quiet hours suppress entirely, don't queue.** Queueing creates an 8am notification storm — worse than no notification.
- **Default quiet hours: 21:00–08:00 local time**, configurable.
- **Copy is factual + brief.** Same tutor voice rules: no exclamation marks, no emoji, no FOMO ("you're about to LOSE your streak!" is forbidden).
- **Multiple devices subscribed to push: send to all** (deduplicate by `notification_id`).
- **Web Push permission denied: show one-time enable banner** (dismissable forever); in-app still works.
- **Email digests deferred to v1, WhatsApp to v2 (Meta Cloud API), SMS deferred indefinitely** (cost + spam-filter risk).

Alternatives considered (aggressive re-engagement push, email in MVP, Slack/Discord integration): see UX_DETAILS for rationale.

## Activity log

- 2026-04-25 — created
