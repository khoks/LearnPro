---
id: STORY-045a
title: Postmark email transport adapter (STORY-045 follow-up)
type: story
status: in-progress
priority: P2
estimate: S
parent: EPIC-012
phase: v1-followup
tags: [notifications, email, transport, follow-up]
created: 2026-05-11
updated: 2026-05-11
---

## Description

STORY-045 shipped the email digest channel with `ResendTransport` as the default. Postmark was explicitly scoped down as a v1 follow-up. This story adds the Postmark adapter alongside Resend so self-hosters can choose their provider via `LEARNPRO_EMAIL_PROVIDER`.

The new `PostmarkTransport` mirrors `ResendTransport`'s contract — same `EmailTransport` interface, same `{ delivered, provider_message_id, reason }` result shape, same error-mapping (4xx → user-actionable; 5xx → transient; network/auth/rate-limit each get their own `reason`). The on-the-wire shape is Postmark-specific (`X-Postmark-Server-Token` header, `From / To / Subject / HtmlBody / TextBody / Headers` body) and is parsed with Zod at the boundary.

## Acceptance criteria

- [ ] New `packages/notifications/email/postmark-transport.ts` implementing the existing `EmailTransport` interface.
- [ ] POST `https://api.postmarkapp.com/email` with `X-Postmark-Server-Token: <env POSTMARK_SERVER_TOKEN>` auth and `Accept: application/json` headers.
- [ ] Same error-mapping shape as ResendTransport — 4xx → user-actionable error; 5xx → retry-eligible; transient failures swallowed (log + return `{ delivered: false; reason }`).
- [ ] `buildEmailTransportFromEnv()` in `apps/api/src/index.ts` (and the sibling `pickEmailTransport` / `pickTransport` helpers in the daily-reminder and weekly-digest cron entry points) supports `LEARNPRO_EMAIL_PROVIDER=postmark`. Reads `POSTMARK_SERVER_TOKEN` + `LEARNPRO_EMAIL_FROM`. Missing config → falls back to `NoopEmailTransport` (matches the Resend pattern).
- [ ] Self-host docs: new `docs/operations/EMAIL_SETUP.md` documents the Resend + Postmark setup steps + env-var matrix.
- [ ] Tests: 8-10 new tests in `packages/notifications/email/postmark-transport.test.ts` covering: send-happy-path with mocked fetch, 4xx error mapping (bad address + auth + rate limit), 5xx error mapping, missing-config short-circuit, Postmark-specific error-response parsing (Postmark returns `{ ErrorCode, Message }` on failure and `{ MessageID, To, SubmittedAt, ErrorCode, Message }` on success).

## Tasks under this Story

(Inline; tracked via the activity log on this Story since this is a small follow-up.)

## Dependencies

- Blocked by: [STORY-045](STORY-045-email-digests.md) (`EmailTransport` interface + `ResendTransport` pattern to mirror).

## Notes

- Postmark's success response shape is `{ MessageID: uuid, To: string, SubmittedAt: string, ErrorCode: 0, Message: "OK" }`. We only validate / surface `MessageID` (the analog of Resend's `id`); the rest is ignored.
- Postmark uses `ErrorCode` (numeric) + `Message` (string) on 4xx failures rather than HTTP-status-only signalling. Specific codes worth recognising on the auth path: 10 (invalid server token), 100 (server token inactive). We currently lump all auth failures into `reason: "auth_failed"` to match the Resend adapter's coarseness.
- Postmark requires a verified sender domain (no sandbox). The setup doc spells this out so operators don't hit a confusing 422 in dev.
- `MessageStream` defaults to `outbound` (Postmark's transactional stream). We don't set it explicitly — Postmark uses `outbound` when omitted, and digest emails are transactional, not broadcast.

## Activity log

- 2026-05-11 — created + picked up
