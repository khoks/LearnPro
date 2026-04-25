---
id: EPIC-002
title: MVP adaptive loop (problem → code → grade → next)
type: epic
status: backlog
priority: P0
phase: mvp
tags: [mvp, loop, integration]
created: 2026-04-25
updated: 2026-04-25
---

## Goal

Prove the core LearnPro value loop end-to-end: a user picks a track, the tutor agent assigns a problem at calibrated difficulty, the user codes in the browser, code runs in a sandbox, the grader evaluates, the tutor explains and updates the learner profile, and the next problem is selected harder/easier accordingly.

If this loop works, LearnPro has product-market fit signal. If it doesn't, no amount of voice / WhatsApp / mobile will rescue it.

## Scope

This Epic is the **integration** Epic — it depends on EPIC-003 (sandbox), EPIC-004 (tutor agent), EPIC-005 (profile), EPIC-007 (problems), EPIC-009 (track content), EPIC-011 (gamification), EPIC-012 (notifications). It glues them together into a usable product.

Specifically owned here:
- Onboarding flow (5 questions).
- Track selection screen.
- Editor + run + grade page (the main user surface).
- Progress dashboard.
- Heuristic difficulty tuner that orchestrates next-problem selection.
- End-to-end Playwright test of the loop.

## Out of scope

- Voice (EPIC-008, deferred to v1).
- Mobile (EPIC-013, deferred to v1+).
- Frameworks (EPIC-003 v1+).
- Mock interviews, project-based learning, etc.

## Stories under this Epic

- STORY-005 — Implement onboarding questionnaire (5 questions)
- STORY-006 — Build editor + run + grade page (main user surface)
- STORY-007 — Heuristic difficulty tuner orchestrating next-problem selection

## Exit criteria

- [ ] A new user can sign up, complete onboarding, pick a track, and successfully solve at least 5 problems with adaptive difficulty.
- [ ] Difficulty tuner visibly responds to user performance (faster solves → harder; many hints → easier).
- [ ] End-to-end Playwright test of the loop passes.
- [ ] Per [`docs/roadmap/MVP.md`](../../docs/roadmap/MVP.md) "Definition of MVP done" all six conditions met.

## Related

- [`docs/roadmap/MVP.md`](../../docs/roadmap/MVP.md)
- ADR: [`ADR-0003-llm-provider`](../../docs/architecture/ADR-0003-llm-provider.md)

## Activity log

- 2026-04-25 — created
