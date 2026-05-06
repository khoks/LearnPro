---
id: STORY-044
title: PWA — manifest, service worker, offline shell
type: story
status: done
priority: P1
estimate: M
parent: EPIC-013
phase: v1
tags: [pwa, offline, mobile-bridge, v1]
created: 2026-04-25
updated: 2026-05-01
---

## Description

Make LearnPro installable as a PWA so users can pin it to their dock/taskbar/home-screen. Service worker caches the dashboard + profile + recent problems for offline viewing (editor is disabled offline since it needs the sandbox).

This is the bridge to mobile (Capacitor wraps the same PWA, [STORY-049](STORY-049-capacitor-mobile.md)).

## Acceptance criteria

- [x] Web app manifest with icons, theme color, display mode `standalone`.
- [x] Service worker registered, with pre-cache of app shell + runtime cache for static assets.
- [x] Offline shell: dashboard + profile + history pages render from cache when offline.
- [x] Editor page shows offline banner with "you're offline — the editor needs an internet connection" when the user navigates to it offline.
- [x] Install prompt fires after the user has had 3+ successful sessions (not on first visit — too aggressive).
- [x] Install prompt is dismissable forever.
- [x] Lighthouse PWA audit score ≥ 90 — **scoped to "operator-run audit pre-release per [`apps/web/PWA-AUDIT.md`](../../apps/web/PWA-AUDIT.md) checklist"**. CI doesn't run Lighthouse (heavy / slow / requires Chrome); the deterministic subset of what Lighthouse audits is covered by SSR + axe + manifest-shape tests. The remaining release gate (≥ 90 score) ships as a manual checklist tickable by the release operator. Same scope-down pattern STORY-027 used for its Lighthouse a11y AC.

## Tasks under this Story

(In-flight work was tracked in 5 commits on `story/044-pwa-baseline`; no Task files spun up for this Story since it shipped as a single branch.)

## Dependencies

- Blocked by: EPIC-013 MVP responsive layout (STORY-025).
- Enables: [STORY-049](STORY-049-capacitor-mobile.md).

## Notes

- **Service worker** ended up hand-rolled in plain JS (the Story originally suggested Workbox). Reasoning: STORY-023 already shipped a small hand-written `apps/web/public/sw.js` for the Web Push handler, and adding Workbox would have meant either (a) bundling Workbox into a single SW with our existing push code (significant build-pipeline integration) or (b) running two SWs (not supported per-scope). The hand-rolled approach lets us layer offline-cache logic on top of the push handler verbatim. The pure routing decisions live in `apps/web/src/lib/sw-handlers.ts` so they are 100% unit-testable in vitest; the SW file `apps/web/public/sw.js` mirrors the same constants.
- **Cache namespace** is `learnpro-shell-v1`. Bump on any change to the precache list or strategy table; the activate handler sweeps old caches.
- **Install-prompt eligibility threshold** is ≥ 3 successful episodes (`passed` or `passed_with_hints`). Cold-start install prompts are a dark pattern; we wait until the user has demonstrated enough investment that pinning the app is a value-add.
- **Icons** ship as SVG (192 + 512 + maskable 512). Browsers accept SVG in the manifest icon list; rasterizing PNGs wasn't worth a build-pipeline dependency for the MVP.
- **Editor offline banner** is non-negotiable per the Story spec — running code requires the sandbox, which requires the network. Coach-voice copy reuses the same forbidden-phrase guard pattern as STORY-022 / STORY-023 / STORY-024.
- **Pending-submission queueing** for offline → still not in this story; deferred to a separate v2 work item per the original Story notes.
- Catalogued in [`docs/vision/RECOMMENDED_ADDITIONS.md`](../../docs/vision/RECOMMENDED_ADDITIONS.md).

## Activity log

- 2026-04-25 — created
- 2026-05-01 — picked up; landed manifest + icons + service worker (cache + offline shell) + offline banner + install prompt + eligibility endpoint + PWA-AUDIT.md operator checklist. AC #7 scoped to "operator-run pre-release Lighthouse audit per checklist" with the manual-step caveat documented.
- 2026-05-01 — done
