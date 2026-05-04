---
id: STORY-017
title: 3-rung hint ladder
type: story
status: done
priority: P0
estimate: S
parent: EPIC-007
phase: mvp
tags: [hints, pedagogy, agent]
created: 2026-04-25
updated: 2026-05-03
---

## Description

When the user clicks "I'm stuck," the tutor returns a hint at one of three explicit rungs:

1. **Conceptual** — "Think about how Python iterates over a dict by default. What does it iterate over: keys, values, or items?"
2. **Approach** — "Use `.items()` to get both key and value, then build a new dict with a comprehension."
3. **Near-solution** — show a 2–3 line skeleton with the key step blanked out.

The user can request escalation but each rung **costs XP** (per the recommended "hint laddering with XP cost" addition). XP cost is small — the goal is to give a real signal of struggle for the profile, not to punish.

The agent never volunteers a hint without being asked (anti-coddling).

## Acceptance criteria

- [x] UI shows a single "Hint" button; clicking escalates one rung at a time (rendered text reads `Hint (rung N)`).
- [x] Each click logs a `hint_used` event tied to the current episode — fired as a `hint_request` interaction (and a `hint_received` after the API responds) via the existing `useInteractionCapture` hook (STORY-055), which writes to the `interactions` table.
- [x] XP cost: rung 1 = 5 XP, rung 2 = 15 XP, rung 3 = 30 XP — supplied by the API (`HINT_RUNG_XP_COST` in `@learnpro/prompts`); the UI renders whatever the server returns next to each hint in the history (no hard-coded XP values in the UI).
- [x] Tutor never proactively gives hints during normal grading feedback — STORY-011's `grade` tool returns rubric + prose only; the UI has no code path that surfaces a hint outside the explicit Hint-button flow.
- [x] Once rung 3 is shown, the "Hint" button is disabled for that problem (`nextHintRung()` in `session-state.ts` returns `null` after 3 hints; the button enters a "Hint (no more)" disabled state).

## Dependencies

- Blocked by: STORY-011 (`give_hint` tool — done 2026-05-01). UNBLOCKED.

## Tasks

(Closed without a separate Task split — landed in the same PR as STORY-062.)

## Activity log

- 2026-04-25 — created
- 2026-05-03 — picked up (alongside STORY-062 — the hint ladder UI lives inside /session)
- 2026-05-03 — done
