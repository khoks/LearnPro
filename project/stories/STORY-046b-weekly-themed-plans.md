---
id: STORY-046b
title: Weekly themed plans (post-STORY-032 knowledge graph)
type: story
status: backlog
priority: P2
estimate: M
parent: EPIC-006
phase: v1
tags: [planning, agent, ux, v1, deferred]
created: 2026-05-01
updated: 2026-05-01
---

## Description

[STORY-046](STORY-046-daily-weekly-plans.md) shipped the daily plan view but deferred the weekly plan view (its AC #2). This Story picks that up once [STORY-032 (knowledge graph population)](STORY-032-knowledge-graph-population.md) lands — sensible weekly themes need a populated concept-prerequisite graph; without it the weekly view is a fake.

The weekly view should:

- Pick a coherent theme for the upcoming week (e.g., "List comprehensions and generators week") by walking the user's track + the prerequisite graph forward from their current position, with optional explicit user goals as bias.
- Show concept-level objectives (3-5 concepts the week is "about"), not problem-level — the daily plan already covers problems.
- Adapt: when a user falls behind by ≥2 weekdays, the planner re-shuffles the rest of the week. When they accelerate (≥2x expected pace), expand the theme to the next concept group.

## Acceptance criteria

- [ ] Weekly plan composer in `@learnpro/agent` (`buildWeeklyPlan`) reads from the knowledge graph (STORY-032) + the user's recent episodes + `concept_reviews` to pick a theme + 3-5 concept objectives.
- [ ] `/v1/weekly-plan` route returns the composed week, gated on STORY-032 graph being populated for the user's track.
- [ ] `<WeeklyPlanCard>` on `/plan` page replaces the current "This week" deferred-stub. Shows theme + per-day suggested concept(s).
- [ ] Re-plan button regenerates the weekly plan (in addition to the daily). Same dampening rules as STORY-046's daily-replan (1-day-miss / weekend → suppressed).
- [ ] Weekly reasoning panel (extends STORY-046's `<PlanReasoningPanel>`) explains why the theme was picked + why each concept was included.

## Tasks under this Story

(To be created when this Story is picked up.)

## Dependencies

- Blocked by: [STORY-032](STORY-032-knowledge-graph-population.md) — knowledge graph population. Without prerequisites populated for each track, the weekly theme picker has no signal to walk.
- Builds on: [STORY-046](STORY-046-daily-weekly-plans.md) — the `<TodayPlanFullView>` component already has the section structure; this Story replaces the deferred stub.

## Notes

- Mastery-roadmap (3–12 month plan) is a SEPARATE v2 work item — see catalog.
- Calendar / iCal export is also separate — see catalog.
- The `/plan` page already renders a stub explaining this deferral so users see why "This week" is empty in the meantime.

## Activity log

- 2026-05-01 — created (filed during STORY-046 implementation; deferred from STORY-046's AC #2 because STORY-032 isn't done)
