---
id: STORY-021
title: Career-aware onboarding interview (target role, time budget, level)
type: story
status: done
priority: P0
estimate: S
parent: EPIC-010
phase: mvp
tags: [onboarding, career, interview]
created: 2026-04-25
updated: 2026-05-01
---

## Description

The career-aware part of the 5-question onboarding (STORY-005) — specifically the **target role** and **goal** questions — drives the initial track recommendation and the difficulty bias on day 1.

A small `roleLibrary` maps roles → recommended tracks → recommended time budget:

```
backend-engineer:
  recommended_tracks: [python-fundamentals, typescript-fundamentals]  # one of these
  recommended_daily_minutes: 45
  bias: standard

ml-engineer:
  recommended_tracks: [python-fundamentals]  # ML/DL tracks come in v3
  recommended_daily_minutes: 60
  bias: math-heavy

career-switcher-from-data-analyst:
  recommended_tracks: [python-fundamentals]
  recommended_daily_minutes: 30
  bias: gentle-onramp
```

For MVP: ~5 hardcoded roles in this library. JD parser and resume gap analysis are v1 work (EPIC-010).

## Acceptance criteria

- [x] `packages/profile/src/roleLibrary.ts` exports the role → recommendation map.
- [x] After onboarding, the user lands on a "Recommended for you" page suggesting a track + time budget.
- [x] User can override the recommendation (free choice, no soft-locks).

## Dependencies

- Blocked by: STORY-005 (onboarding), STORY-019/020 (tracks must exist).

## Tasks

(To be created when work begins.)

## Activity log

- 2026-04-25 — created
- 2026-05-01 — picked up
- 2026-05-01 — done. New `@learnpro/profile` workspace package (chose new package over folding into `@learnpro/scoring` to match the spec's `packages/profile/src/roleLibrary.ts` path; `@learnpro/scoring` stays focused on pure adaptive policies). 7 hardcoded MVP roles (`backend-engineer` / `frontend-engineer` / `full-stack-engineer` / `ml-engineer` / `data-scientist` / `career-switcher-from-data-analyst` / `student-cs-undergrad`). Pure `getRecommendation(library, target_role)` does case-insensitive trim-aware slug lookup, returns null on miss. New `GET /v1/recommendation` Fastify route returns `{ role, recommended_tracks: TrackSummary[], recommended_daily_minutes }` (joined against the `tracks` table via new `getTracksBySlugs` helper in `@learnpro/db` that preserves input slug order). New `/recommended` server component proxies through `/api/recommendation`, redirects to `/dashboard` when role is null (free choice, no soft-locks per AC #3). Pure `<RecommendedTracksCard>` extracted for unit testing. Coach-voice bias-specific copy with forbidden-phrase guard. Updated `destinationFor()` post-signin rule (target_role + 0 episodes → /recommended; ≥1 episode → /dashboard); legacy single-arg form preserved so dashboard's defensive recheck still works. 28 new tests (29 in `@learnpro/profile`, 8 recommendation route, 11 component, 6 net post-signin).
