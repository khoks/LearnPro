---
id: STORY-069
title: /session page accepts track slug, not only UUID (fixes /recommended → /session navigation)
type: story
status: in-progress
priority: P0
estimate: XS
parent: EPIC-017
phase: v1
tags: [bug, session, recommended, ux]
created: 2026-05-12
updated: 2026-05-12
---

## Description

`RecommendedTracksCard` builds card hrefs as `/session?track=${encodeURIComponent(track.slug)}` (so the user sees a human-readable URL like `/session?track=python-fundamentals`). But `apps/web/src/app/session/page.tsx` only accepts UUID-form `track` query params — it has an `isUuid()` guard that bails to a "Pick a track" empty state for anything else.

Result: every click on a `/recommended` card lands on a dead "Pick a track. Open a session with `?track=<track-id>`" message — the entire post-onboarding flow stops dead at the recommendation page.

Caught during the 2026-05-12 Chrome walkthrough (round 2).

## Acceptance criteria

- [x] Add `getTrackIdBySlug(db, slug, org_id?)` to `@learnpro/db`. Returns `string | null`.
- [x] `/session` page resolves UUID-form input directly; slug-form input through `getTrackIdBySlug`; missing slug → "Pick a track" empty state (unchanged).
- [x] Manual verification: `/recommended` → click Python fundamentals card → lands on `/session?track=python-fundamentals` with the SessionClient rendered for a real problem (not the empty state).
- [ ] Unit test for `getTrackIdBySlug` (integration — needs Postgres).
- [ ] Component test for `/session/page.tsx` that asserts slug input resolves before bailing to the empty state.

## Dependencies

- Builds on STORY-068 (tracks must actually exist in the DB for the slug lookup to find anything).

## Activity log

- 2026-05-12 — created + fixed. Found during Chrome walkthrough round 2 (after STORY-068 unblocked seeded content). Verified in Chrome — `/session?track=python-fundamentals` now renders a real problem panel (Python or Debug).
