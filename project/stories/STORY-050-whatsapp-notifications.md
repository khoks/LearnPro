---
id: STORY-050
title: WhatsApp notifications via Meta Cloud API
type: story
status: backlog
priority: P1
estimate: M
parent: EPIC-012
phase: v2
tags: [notifications, whatsapp, meta-cloud-api, v2]
created: 2026-04-25
updated: 2026-04-25
---

## Description

The user's original vision specifically called out WhatsApp as a notification channel. Implement via the [Meta Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api/) (not Twilio — much cheaper for high-volume use).

Used for: daily reminder, weekly recap, and grace-day notifications. Same anti-FOMO copy rules apply (see [`docs/product/UX_DETAILS.md § EPIC-012`](../../docs/product/UX_DETAILS.md#epic-012--notifications)).

## Acceptance criteria

- [ ] WhatsApp channel adapter in `packages/notifications/whatsapp/`.
- [ ] Meta Business Account set up with verified phone number (one-time ceremony per deploy).
- [ ] Approved message templates (Meta requires pre-approval for non-session messages): daily-reminder, weekly-recap, grace-day-used, concept-mastered.
- [ ] User opt-in flow in settings (phone number entry + WhatsApp opt-in checkbox + verification).
- [ ] STOP keyword respected (per WhatsApp policy).
- [ ] Quiet hours respected.
- [ ] Self-hosters need their own Meta Business setup — documented in setup guide; alternative is to disable the WhatsApp channel.

## Tasks under this Story

(To be created when this Story is picked up.)

## Dependencies

- Blocked by: EPIC-012 MVP `NotificationChannel` interface (STORY-023).

## Notes

- Meta Cloud API pricing (as of 2026): ~$0.005–$0.01 per utility message in most markets. Affordable.
- The verification ceremony is the time-eater; budget 1–2 weeks of calendar time, not engineering time.
- Catalogued in [`docs/vision/RECOMMENDED_ADDITIONS.md`](../../docs/vision/RECOMMENDED_ADDITIONS.md).

## Activity log

- 2026-04-25 — created
