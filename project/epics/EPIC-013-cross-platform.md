---
id: EPIC-013
title: Cross-platform (Windows-first → PWA → mobile)
type: epic
status: backlog
priority: P1
phase: mvp
tags: [cross-platform, responsive, pwa, mobile]
created: 2026-04-25
updated: 2026-04-25
---

## Goal

Build LearnPro as a responsive web app from day 1 (Windows browser baseline) so the path to PWA installability and Capacitor mobile wrappers is a small step, not a rebuild. OS-specific bits (containers, notifications, file system) live behind adapters so Mac and Linux can plug in later.

## Scope

**MVP:**
- Responsive layout that works at 1920×1080 (laptop) and degrades cleanly to ~768px (tablet).
- Tailwind responsive utilities used throughout.
- OS adapter directory structure (`scripts/{windows,mac,linux}/`) with Windows implemented and mac/linux stubbed.

**v1+:**
- PWA: manifest, service worker, install prompt, offline shell.
- Service worker caches lessons and queues submissions for offline.

**v2+:**
- Capacitor wrapper for iOS and Android (same Next build, native plugins for mic and push only).
- Tablet-optimized layout (larger touch targets, side-by-side panels).

**v3+:**
- React Native rewrite *only if* performance forces it (it won't, for an editor-centric app).

## Out of scope

- Native desktop apps (Electron / Tauri) — browser is fine.
- Apple Watch / wearable companion (no).
- Smart-TV apps (no).

## Stories under this Epic

- STORY-025 — Responsive web app (Windows browser baseline) (MVP)

## Exit criteria (MVP)

- [ ] Every page renders cleanly at 1920×1080 and 1366×768.
- [ ] No horizontal scroll at 768px width.
- [ ] OS adapter folder structure exists with Windows scripts and stubs for mac/linux.

## Related

- Vision: [`docs/vision/GROOMED_FEATURES.md`](../../docs/vision/GROOMED_FEATURES.md) § Theme 10

## Design notes & alternatives

See [`docs/product/UX_DETAILS.md § EPIC-013`](../../docs/product/UX_DETAILS.md#epic-013--cross-platform-responsive-web-baseline) for the full deep-dive.

Key locked decisions for this Epic:
- **Editor page is desktop-only in MVP** (≥ 1280px primary, 768–1279px tablet usable with bottom drawer for tutor). Mobile (< 768px) shows "use a wider screen for the editor" with a deep link — we don't ship a broken Monaco-on-mobile experience.
- **Dashboard, profile, settings, history all work mobile-OK.** Users can check progress on phone; just can't code there in MVP.
- **PWA + Capacitor mobile wrapper deferred** (v1 / v2). Build the loop first, prove it, then wrap it.
- **Browser support: modern Chromium, Firefox, Safari.** No IE / no legacy Edge. Safari mobile WebSocket flakiness handled with SSE fallback.
- **Pre-warm sandbox during onboarding** so first Run is never cold (also covers slow-network users).

Alternatives considered (native iOS/Android in MVP, force-fit Monaco on mobile, drop responsive entirely): see UX_DETAILS for rationale.

## Activity log

- 2026-04-25 — created
