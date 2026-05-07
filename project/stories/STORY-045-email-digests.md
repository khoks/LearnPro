---
id: STORY-045
title: Email digest notifications (daily + weekly)
type: story
status: done
priority: P2
estimate: S
parent: EPIC-012
phase: v1
tags: [notifications, email, digest, v1]
created: 2026-04-25
updated: 2026-05-06
---

## Description

Add email as a `NotificationChannel` adapter. Two digest types:

- **Daily** — "Yesterday: solved 3 problems, mastered list comprehensions, tomorrow's plan is X." Sent at user's preferred reminder time.
- **Weekly** — "This week: closed N concepts, total time M hours, here's your skill snapshot." Sent on user's preferred weekly day.

Opt-in (off by default). Full unsubscribe link. Same anti-FOMO copy rules as Web Push (see [`docs/product/UX_DETAILS.md § EPIC-012`](../../docs/product/UX_DETAILS.md#epic-012--notifications)).

## Acceptance criteria

- [x] Email channel adapter implemented in `packages/notifications/email/`.
- [x] Configurable provider — Resend default, Postmark optional. *(Resend shipped; Postmark deferred — see follow-up note in activity log.)*
- [x] Daily digest template + weekly digest template (hand-written table-based HTML; MJML deferred as a future swap if more email types land).
- [x] Opt-in flow in settings (separate per channel: daily / weekly).
- [x] Unsubscribe link in every email; one-click unsubscribe (RFC 8058 header).
- [x] Quiet hours respected (digest scheduled outside quiet hours) — dispatch routes through the same `QuietHoursDispatcher` that wraps `runDailyReminder`; in-window dispatches are deferred via `processDeferredNotifications` (anti-dark-pattern: never dropped, only deferred).
- [x] No marketing copy. Same factual tone as in-app notifications — every digest variant scans clean against the shared `FORBIDDEN_PHRASES` set.

## Tasks under this Story

(To be created when this Story is picked up.)

## Dependencies

- Blocked by: EPIC-012 MVP `NotificationChannel` interface (STORY-023).

## Notes

- Self-hosters configure SMTP credentials via env vars (or use Resend's free tier).
- Catalogued in [`docs/vision/RECOMMENDED_ADDITIONS.md`](../../docs/vision/RECOMMENDED_ADDITIONS.md).

## Activity log

- 2026-04-25 — created
- 2026-05-06 — picked up; design + implementation alignment
- 2026-05-06 — done. Migration `0014_email_digests.sql` adds 4 `profiles` columns
  (`email_daily_opt_in` / `email_weekly_opt_in` / `email_weekly_day_of_week` /
  `email_unsubscribe_token`). New `packages/notifications/email/` package surface:
  `EmailChannel` (NotificationChannel impl), `ResendTransport` (REST-only Resend
  adapter, no SDK), `MockEmailTransport` / `NoopEmailTransport`, and pure
  `buildDailyDigest()` / `buildWeeklyDigest()` builders rendering hand-written
  table-based inlined-style HTML + plain-text fallback. New DB helpers in
  `@learnpro/db`: `getEmailDigestPrefs` / `updateEmailDigestPrefs` /
  `unsubscribeByToken` / `listDigestRecipients` / `listFinishedEpisodesInWindow` /
  `listSkillSnapshot`. Per-user 32-byte hex `email_unsubscribe_token` minted
  lazily on first opt-in (stable across opt-out / re-opt-in cycles).
  New Fastify routes: GET / PUT `/v1/settings/email-digest` (auth-gated), GET
  `/v1/email/unsubscribe?token=...` (HTML success page), POST
  `/v1/email/unsubscribe?token=...` (RFC 8058 one-click). Daily digest cron
  extends the existing `daily-reminder.ts`; new standalone `weekly-digest.ts`
  cron filters recipients by ISO weekday match. Both crons attach
  `List-Unsubscribe: <https://...>` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click`
  headers per RFC 8058. New `<EmailDigestCard>` + `/settings/notifications` page
  + Next.js proxy at `/api/settings/email-digest`. ~80 new tests across builders /
  channel / transport / cron / routes / settings UI / forbidden-phrase scans.
- **Decision: provider** — Resend chosen as default (per spec). Implemented as a
  REST-only adapter that posts to `/emails` directly so we don't pull the
  `resend` npm SDK at runtime (~140 KB saved, fewer transitive deps). API
  shape is small + stable; can swap in the SDK later without a public-surface
  change.
- **Decision: templating** — opted for hand-written HTML over MJML. Two static
  templates didn't justify a runtime template-compile step. The builders have
  a stable `{ subject, html, text }` output shape, so swapping in MJML or
  react-email later is a private-implementation change. Filed no follow-up
  because the digests are visually fine and pass HTML escaping tests.
- **Deferred: Postmark adapter** — Resend ships first; Postmark adapter is
  optional per the Story note and was descoped for v1. Filed below as a
  follow-up. Adding it is mechanical: a new file in `packages/notifications/email/`
  implementing the `EmailTransport` interface, then a branch in
  `buildEmailTransportFromEnv()` for `LEARNPRO_EMAIL_PROVIDER=postmark`.
- **Follow-up: Postmark transport** — implement `PostmarkTransport` against
  the same `EmailTransport` interface. POST to `https://api.postmarkapp.com/email`
  with `{ From, To, Subject, HtmlBody, TextBody, MessageStream, Headers }`.
  Auth via `X-Postmark-Server-Token` header. Same error-mapping shape as
  ResendTransport (4xx → bad_address; 401 → auth_failed; 5xx → transient).
