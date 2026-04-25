---
id: EPIC-006
title: Multi-horizon planning (session / day / week / mastery)
type: epic
status: backlog
priority: P1
phase: mvp
tags: [planning, agent, scheduling]
created: 2026-04-25
updated: 2026-04-25
---

## Goal

Generate plans across four horizons — current session (25–60 min), today, this week, and the long-arc mastery roadmap toward the user's target role. The plans must adapt: when the user falls behind, plans shift; when they accelerate, plans expand.

## Scope

**MVP:**
- Session plan: 3–5 micro-objectives generated at session start, displayed on the dashboard.

**v1+:**
- Daily plan: combines spaced-repetition review queue + new material.
- Weekly plan: themed weeks (e.g., "React state management week").
- Re-planner: detects falling behind / accelerating and adjusts.
- "What did I do today?" auto-recap (LLM-generated).

**v2+:**
- Mastery roadmap: 3–12 month track to a target role.
- Calendar / iCal export of planned sessions.

## Out of scope

- Mid-horizon plan UI in MVP (deferred to v1).
- Project-based learning capstones (separate Epic in v2).

## Stories under this Epic

- STORY-016 — Session plan generator (3-5 micro-objectives) (MVP)

## Exit criteria (MVP)

- [ ] Session plan visible at session start.
- [ ] Plan adapts to recent performance (e.g., a user who just struggled gets a review-focused micro-objective).
- [ ] Plan persists across page reloads within the session.

## Related

- Vision: [`docs/vision/GROOMED_FEATURES.md`](../../docs/vision/GROOMED_FEATURES.md) § Theme 3

## Activity log

- 2026-04-25 — created
