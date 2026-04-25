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

## Activity log

- 2026-04-25 — created
