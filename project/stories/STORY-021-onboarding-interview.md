---
id: STORY-021
title: Career-aware onboarding interview (target role, time budget, level)
type: story
status: backlog
priority: P0
estimate: S
parent: EPIC-010
phase: mvp
tags: [onboarding, career, interview]
created: 2026-04-25
updated: 2026-04-25
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

- [ ] `packages/profile/src/roleLibrary.ts` exports the role → recommendation map.
- [ ] After onboarding, the user lands on a "Recommended for you" page suggesting a track + time budget.
- [ ] User can override the recommendation (free choice, no soft-locks).

## Dependencies

- Blocked by: STORY-005 (onboarding), STORY-019/020 (tracks must exist).

## Tasks

(To be created when work begins.)

## Activity log

- 2026-04-25 — created
