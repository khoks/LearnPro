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

## Design notes & alternatives

See [`docs/product/UX_DETAILS.md § EPIC-006`](../../docs/product/UX_DETAILS.md#epic-006--multi-horizon-planning) for the full deep-dive.

Key locked decisions for this Epic:
- **MVP only does session-level planning.** Day, week, mastery horizons defer to v1 — building them before the session loop is validated risks over-planning a learner who isn't retaining anything.
- **3–5 micro-objectives per session, generated at start.** Each is concrete (e.g., "Apply list comprehensions to a real filtering problem") — not vague ("Get better at Python").
- **Plan IS the sidebar; work IS the editor.** No separate "review your plan" screen. Objectives auto-check off when their exit condition fires (e.g., "solve 2 problems on dict-of-lists" → 2 problems passed).
- **Soft budgets, not hard cuts.** When daily time budget is hit mid-problem, tutor shows "Finish this and call it a day, or keep going — your call." No auto-stop.
- **Streak credit at first solve**, regardless of total time. Removes incentive to grind out 10 meaningless minutes just to "not break the streak."
- **No "edit plan" button in MVP.** User overrides via tutor ("I want to do something different today") which triggers session-plan agent regen.
- **Don't shame missed days.** Re-balance toward fading concepts on return; never say "you missed 3 days."

Alternatives considered (multi-horizon UI in MVP, hard time cuts, AI-only plan with no exit conditions): see UX_DETAILS for rationale.

## Activity log

- 2026-04-25 — created
