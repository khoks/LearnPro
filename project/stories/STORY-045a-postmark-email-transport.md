---
id: STORY-045a
title: Postmark email transport adapter (STORY-045 follow-up)
type: story
status: done
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

- [x] New `packages/notifications/email/postmark-transport.ts` implementing the existing `EmailTransport` interface.
- [x] POST `https://api.postmarkapp.com/email` with `X-Postmark-Server-Token: <env POSTMARK_SERVER_TOKEN>` auth and `Accept: application/json` headers.
- [x] Same error-mapping shape as ResendTransport — 4xx → user-actionable error; 5xx → retry-eligible; transient failures swallowed (log + return `{ delivered: false; reason }`).
- [x] `buildEmailTransportFromEnv()` extracted into a shared `apps/api/src/email-transport-env.ts` helper and called from `apps/api/src/index.ts` + the daily-reminder and weekly-digest cron entry points. Supports `LEARNPRO_EMAIL_PROVIDER=postmark`. Reads `POSTMARK_SERVER_TOKEN` + `LEARNPRO_EMAIL_FROM`. Missing config → falls back to `NoopEmailTransport` (matches the Resend pattern).
- [x] Self-host docs: new `docs/operations/EMAIL_SETUP.md` documents the Resend + Postmark setup steps + env-var matrix.
- [x] Tests: 12 new tests in `packages/notifications/email/postmark-transport.test.ts` covering constructor validation, send-happy-path with mocked fetch, 4xx error mapping (auth + rate-limit + bad-address), 5xx error mapping, network-error path, malformed success body, tolerated non-JSON 4xx body, Postmark-specific `{ErrorCode, Message}` error parsing surfaced in log meta, header translation (plain map → `[{Name, Value}]` array), and `name === "postmark"`. Plus 11 new tests in `apps/api/src/email-transport-env.test.ts` covering both providers' happy paths, both providers' missing-key fallback (with log capture), case-insensitive provider parsing, unknown-provider fallback, and silent fallback when no log callback is provided.

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
- 2026-05-11 — done. New `packages/notifications/email/postmark-transport.ts` mirrors
  `ResendTransport`'s contract: POST to `https://api.postmarkapp.com/email` with
  `X-Postmark-Server-Token` auth, PascalCase `{From, To, Subject, HtmlBody, TextBody,
  Headers, ReplyTo}` body (plain-map `EmailMessage.headers` translated to Postmark's
  `[{Name, Value}]` array at the boundary), Zod-validated `MessageID` success response.
  Same coarse error-mapping as Resend — 4xx → bad_address / auth_failed / rate_limited,
  5xx → transient_5xx, network → swallowed + logged. Postmark's `{ErrorCode, Message}`
  4xx body is parsed and surfaced via the log meta. The `buildEmailTransportFromEnv`
  picker was extracted from three near-duplicate inline copies (apps/api/src/index.ts,
  daily-reminder.ts, weekly-digest.ts) into a new shared module
  `apps/api/src/email-transport-env.ts` so the provider-routing logic is unit-tested
  in one place. New `docs/operations/EMAIL_SETUP.md` walks operators through Resend
  vs Postmark setup + env-var matrix + fail-soft behaviour. ~23 new tests (12 Postmark
  transport + 11 env picker).
