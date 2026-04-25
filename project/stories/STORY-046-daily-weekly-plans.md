---
id: STORY-046
title: Daily and weekly plan views (multi-horizon planning UI)
type: story
status: backlog
priority: P1
estimate: M
parent: EPIC-006
phase: v1
tags: [planning, agent, ux, v1]
created: 2026-04-25
updated: 2026-04-25
---

## Description

MVP only has session-level planning. v1 surfaces two longer horizons:

- **Today's plan** — combined review queue (from FSRS, [STORY-031](STORY-031-fsrs-spaced-repetition.md)) + new material. Shown on dashboard.
- **This week** — themed week (e.g., "React state management week") generated from the user's current track position + any explicit goals they've set.

The plans adapt: when a user falls behind, the planner re-shuffles. When they accelerate, plans expand.

## Acceptance criteria

- [ ] Daily plan view on dashboard: shows today's review items + today's new material, with a "start session" CTA.
- [ ] Weekly plan view on dashboard: shows this week's theme + concept-level objectives.
- [ ] Both plans regenerate when user explicitly hits "re-plan" OR when significant deviation is detected (e.g., 2 missed days in a row).
- [ ] Plans persist across sessions and are visible in history.
- [ ] Re-planner dampening: don't aggressively re-plan on a single missed day (false-positive on weekends).
- [ ] An "advanced" toggle reveals the planner's *reasoning* (which concepts it picked and why) — for users who want transparency.

## Tasks under this Story

(To be created when this Story is picked up.)

## Dependencies

- Blocked by: EPIC-006 MVP session plan (STORY-015), [STORY-031](STORY-031-fsrs-spaced-repetition.md) (review queue), [STORY-032](STORY-032-knowledge-graph-population.md) (sensible weekly themes need a populated graph).

## Notes

- Mastery-roadmap (3–12 month plan) is a SEPARATE v2 work item — see catalog.
- Calendar / iCal export is also separate — see catalog.
- Catalogued in [`docs/vision/RECOMMENDED_ADDITIONS.md`](../../docs/vision/RECOMMENDED_ADDITIONS.md).

## Activity log

- 2026-04-25 — created
