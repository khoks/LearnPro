---
id: STORY-017
title: 3-rung hint ladder
type: story
status: backlog
priority: P0
estimate: S
parent: EPIC-007
phase: mvp
tags: [hints, pedagogy, agent]
created: 2026-04-25
updated: 2026-04-25
---

## Description

When the user clicks "I'm stuck," the tutor returns a hint at one of three explicit rungs:

1. **Conceptual** — "Think about how Python iterates over a dict by default. What does it iterate over: keys, values, or items?"
2. **Approach** — "Use `.items()` to get both key and value, then build a new dict with a comprehension."
3. **Near-solution** — show a 2–3 line skeleton with the key step blanked out.

The user can request escalation but each rung **costs XP** (per the recommended "hint laddering with XP cost" addition). XP cost is small — the goal is to give a real signal of struggle for the profile, not to punish.

The agent never volunteers a hint without being asked (anti-coddling).

## Acceptance criteria

- [ ] UI shows a single "Hint" button; clicking escalates one rung at a time.
- [ ] Each click logs a `hint_used` event tied to the current episode.
- [ ] XP cost: rung 1 = 5 XP, rung 2 = 15 XP, rung 3 = 30 XP (configurable per problem).
- [ ] Tutor never proactively gives hints during normal grading feedback.
- [ ] Once rung 3 is shown, the "Hint" button is disabled for that problem.

## Dependencies

- Blocked by: STORY-011 (`give_hint` tool).

## Tasks

(To be created when work begins.)

## Activity log

- 2026-04-25 — created
