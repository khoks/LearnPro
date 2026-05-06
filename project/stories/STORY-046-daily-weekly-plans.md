---
id: STORY-046
title: Daily and weekly plan views (multi-horizon planning UI)
type: story
status: done
priority: P1
estimate: M
parent: EPIC-006
phase: v1
tags: [planning, agent, ux, v1]
created: 2026-04-25
updated: 2026-05-01
---

## Description

MVP only has session-level planning. v1 surfaces two longer horizons:

- **Today's plan** — combined review queue (from FSRS, [STORY-031](STORY-031-fsrs-spaced-repetition.md)) + new material. Shown on dashboard.
- **This week** — themed week (e.g., "React state management week") generated from the user's current track position + any explicit goals they've set.

The plans adapt: when a user falls behind, the planner re-shuffles. When they accelerate, plans expand.

## Acceptance criteria

- [x] Daily plan view on dashboard: shows today's review items + today's new material, with a "start session" CTA. — `<TodayPlanSummaryCard>` on `/dashboard` (compact view) + full `/plan` page surface today's review queue + session plan items composed from `session_plans` (STORY-015) + `concept_reviews` (STORY-031).
- [ ] Weekly plan view on dashboard: shows this week's theme + concept-level objectives. — **Deferred to STORY-046b (post-STORY-032 knowledge graph).** Sensible weekly themes need a populated concept-prerequisite graph; without it the weekly view would be a fake. The `/plan` page renders an explicit "This week" stub explaining the deferral. We deliberately did not fake the surface.
- [x] Both plans regenerate when user explicitly hits "re-plan" OR when significant deviation is detected (e.g., 2 missed days in a row). — `POST /v1/today-plan/replan` (and `/api/today-plan/replan` proxy + "Re-plan" button on the `/plan` page) regenerates the session-plan portion. FSRS reviews are not "re-planned" (FSRS is its own scheduler).
- [x] Plans persist across sessions and are visible in history. — Today's plan is composed at read-time from existing persistent stores (`session_plans` + `concept_reviews` + `episodes`); no new schema. The session-plan history is already in `session_plans`. Review history is already in `concept_reviews`.
- [x] Re-planner dampening: don't aggressively re-plan on a single missed day (false-positive on weekends). — `computeDampeningReason()` in `@learnpro/agent/today-plan.ts`: suppresses regenerate when (a) the user missed only 1 weekday or (b) it's Saturday/Sunday. The route returns the existing plan + a friendly `reason` string for the UI banner.
- [x] An "advanced" toggle reveals the planner's *reasoning* (which concepts it picked and why) — for users who want transparency. — `<PlanReasoningPanel>` (native `<details>` element so it works without JS) emits per-item reasoning text derived from FSRS `state.due` (review items) and the planner's own `objective` (session-plan items).

## Tasks under this Story

(Implemented inline; no sub-tasks created.)

## Dependencies

- Blocked by: EPIC-006 MVP session plan (STORY-015), [STORY-031](STORY-031-fsrs-spaced-repetition.md) (review queue), [STORY-032](STORY-032-knowledge-graph-population.md) (sensible weekly themes need a populated graph).

## Notes

- **Weekly plan view deferred**: see [STORY-046b](STORY-046b-weekly-themed-plans.md) (filed alongside) — picks up after STORY-032 lands.
- Mastery-roadmap (3–12 month plan) is a SEPARATE v2 work item — see catalog.
- Calendar / iCal export is also separate — see catalog.
- Catalogued in [`docs/vision/RECOMMENDED_ADDITIONS.md`](../../docs/vision/RECOMMENDED_ADDITIONS.md).

## Activity log

- 2026-04-25 — created
- 2026-05-01 — picked up; today-plan composer landed (28 unit tests); API routes landed (13 route tests); `/plan` page + dashboard summary card landed (30 component tests). Weekly view deferred to STORY-046b. Daily view + re-plan + dampening + advanced toggle (5 of 6 ACs) shipped.
- 2026-05-01 — done
