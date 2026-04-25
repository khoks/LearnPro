---
id: STORY-049
title: Capacitor mobile wrapper for iOS and Android
type: story
status: backlog
priority: P1
estimate: L
parent: EPIC-013
phase: v2
tags: [mobile, capacitor, ios, android, v2]
created: 2026-04-25
updated: 2026-04-25
---

## Description

Wrap the existing Next.js + PWA build with [Capacitor](https://capacitorjs.com/) for distribution via the Apple App Store and Google Play. Native plugins are scoped narrowly: mic (for future voice tutor) and push (for native notifications). Everything else is the web app.

The editor is desktop-recommended (per [`docs/product/UX_DETAILS.md § EPIC-013`](../../docs/product/UX_DETAILS.md#epic-013--cross-platform-responsive-web-baseline)); the mobile app is for dashboard, profile, recap, light review tasks, and (later) voice-mode tutor sessions.

## Acceptance criteria

- [ ] Capacitor project set up alongside the web build (`apps/mobile/` or `apps/web/capacitor/`).
- [ ] iOS build runs in Xcode simulator + on device.
- [ ] Android build runs in Android Studio emulator + on device.
- [ ] Native push integration (FCM for Android, APNs for iOS) wired through `NotificationChannel`.
- [ ] App-store-quality launch screens, icons, app description copy.
- [ ] Submitted to App Store and Play Store (requires developer accounts).
- [ ] Editor view on phone shows the "use desktop" message (consistent with PWA behavior).

## Tasks under this Story

(To be created when this Story is picked up.)

## Dependencies

- Blocked by: [STORY-044](STORY-044-pwa-baseline.md) (Capacitor wraps the PWA).

## Notes

- Native mic is for v2 voice tutor (deferred to EPIC-008 work).
- Submission ceremony eats real time: developer accounts ($99/yr Apple, $25 one-time Google), review cycles, screenshots, etc.
- Catalogued in [`docs/vision/RECOMMENDED_ADDITIONS.md`](../../docs/vision/RECOMMENDED_ADDITIONS.md).

## Activity log

- 2026-04-25 — created
