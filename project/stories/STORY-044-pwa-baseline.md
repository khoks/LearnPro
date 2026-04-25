---
id: STORY-044
title: PWA — manifest, service worker, offline shell
type: story
status: backlog
priority: P1
estimate: M
parent: EPIC-013
phase: v1
tags: [pwa, offline, mobile-bridge, v1]
created: 2026-04-25
updated: 2026-04-25
---

## Description

Make LearnPro installable as a PWA so users can pin it to their dock/taskbar/home-screen. Service worker caches the dashboard + profile + recent problems for offline viewing (editor is disabled offline since it needs the sandbox).

This is the bridge to mobile (Capacitor wraps the same PWA, [STORY-049](STORY-049-capacitor-mobile.md)).

## Acceptance criteria

- [ ] Web app manifest with icons, theme color, display mode `standalone`.
- [ ] Service worker registered, with pre-cache of app shell + runtime cache for static assets.
- [ ] Offline shell: dashboard + profile + history pages render from cache when offline.
- [ ] Editor page shows offline banner with "you're offline — the editor needs an internet connection" when the user navigates to it offline.
- [ ] Install prompt fires after the user has had 3+ successful sessions (not on first visit — too aggressive).
- [ ] Install prompt is dismissable forever.
- [ ] Lighthouse PWA audit score ≥ 90.

## Tasks under this Story

(To be created when this Story is picked up.)

## Dependencies

- Blocked by: EPIC-013 MVP responsive layout (STORY-025).
- Enables: [STORY-049](STORY-049-capacitor-mobile.md).

## Notes

- Service worker: prefer Workbox over hand-rolled.
- Pending-submission queueing for offline → not in this story; defer to a separate v2 work item.
- Catalogued in [`docs/vision/RECOMMENDED_ADDITIONS.md`](../../docs/vision/RECOMMENDED_ADDITIONS.md).

## Activity log

- 2026-04-25 — created
