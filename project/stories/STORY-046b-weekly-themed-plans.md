---
id: STORY-046b
title: Weekly themed plans (post-STORY-032 knowledge graph)
type: story
status: done
priority: P2
estimate: M
parent: EPIC-006
phase: v1
tags: [planning, agent, ux, v1]
created: 2026-05-01
updated: 2026-05-06
---

## Description

[STORY-046](STORY-046-daily-weekly-plans.md) shipped the daily plan view but deferred the weekly plan view (its AC #2). This Story picks that up once [STORY-032 (knowledge graph population)](STORY-032-knowledge-graph-population.md) lands — sensible weekly themes need a populated concept-prerequisite graph; without it the weekly view is a fake.

The weekly view should:

- Pick a coherent theme for the upcoming week (e.g., "List comprehensions and generators week") by walking the user's track + the prerequisite graph forward from their current position, with optional explicit user goals as bias.
- Show concept-level objectives (3-5 concepts the week is "about"), not problem-level — the daily plan already covers problems.
- Adapt: when a user falls behind by ≥2 weekdays, the planner re-shuffles the rest of the week. When they accelerate (≥2x expected pace), expand the theme to the next concept group.

## Acceptance criteria

- [x] Weekly plan composer in `@learnpro/agent` (`buildWeeklyPlan`) reads from the knowledge graph (STORY-032) + the user's recent episodes + `concept_reviews` to pick a theme + 3-5 concept objectives.
- [x] `/v1/weekly-plan` route returns the composed week, gated on STORY-032 graph being populated for the user's track. Returns 503 `weekly_plan_unavailable` when the graph isn't seeded.
- [x] `<WeeklyPlanCard>` on `/plan` page replaces the current "This week" deferred-stub. Shows theme + per-day suggested concept(s).
- [x] Re-plan button regenerates the weekly plan (in addition to the daily). Same dampening rules as STORY-046's daily-replan (1-day-miss / weekend → suppressed).
- [x] Weekly reasoning panel (`<details>` block inside `<WeeklyPlanCard>`) explains why the theme was picked + lists every concept the week is "about".

## Deferred / explicitly-skipped

- LLM-generated theme names — v1 uses the dominant concept's `name` field as the theme ("List comprehensions week"). LLM-gen is a separate follow-up.
- Mastery-roadmap (3-12 month plan) — separate v2 work item.
- Calendar / iCal export — separate.

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
- 2026-05-06 — picked up; STORY-032 has landed (206 concepts + 428 prerequisite edges seeded)
- 2026-05-06 — done. New `buildWeeklyPlan` pure function in `@learnpro/agent` walks the populated knowledge graph in topological order from the user's frontier and picks 3-5 concepts (pace-adaptive: behind/on-pace/accelerated). New `GET /v1/weekly-plan` + `POST /v1/weekly-plan/replan` Fastify routes with 503 on empty graph or no-active-track. New Next.js proxy at `/api/weekly-plan` (GET + POST). New `<WeeklyPlanCard>` renders theme + 7-day grid + reasoning panel, with re-plan button mirroring STORY-046's daily dampening. ~68 new tests across the 3 layers (37 agent + 15 api + 16 web). LLM-generated theme names deferred to a follow-up.
