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
- Auth + profile-shell bootstrap ([STORY-005](../stories/STORY-005-auth-and-onboarding.md)). The conversational onboarding agent itself was re-scoped out of this Epic on 2026-04-25 (Path A) and now lives in EPIC-004 as [STORY-053](../stories/STORY-053-conversational-onboarding-agent.md).
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

- [STORY-005](../stories/STORY-005-auth-and-onboarding.md) — Auth.js + bootstrap profile shell (re-scoped 2026-04-25; conversational onboarding moved to STORY-053)
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

## Design notes & alternatives

See [`docs/product/UX_DETAILS.md § EPIC-002`](../../docs/product/UX_DETAILS.md#epic-002--mvp-adaptive-loop) and [§ The first-session magic moment](../../docs/product/UX_DETAILS.md#the-first-session-magic-moment-cross-cutting) for the full deep-dive.

Key locked decisions for this Epic:
- **First-session budget: ≤ 8 minutes from sign-up to first green checkmark.** Pre-warm the sandbox during onboarding so Run is never cold the first time.
- **Run vs. Submit are deliberately separate buttons.** Run is free + fast (visible tests only); Submit grades + counts (visible + hidden tests + tutor commentary). Single-button "every keystroke runs tests" patterns train learned helplessness — we explicitly reject them.
- **Dashboard shows ONE big card, not a feed.** No leaderboard, no recommended-content carousel.
- **Session-end UX has one CTA: "Done — see you tomorrow."** No upsell, no rating prompt, no "share progress."
- **Pre-populate the editor with a function signature + visible failing test.** Removes blank-page paralysis, mirrors real-world TDD-ish workflow.

Alternatives considered (skill-test pre-quiz, single Run-Submit button, tutor-led tour, etc.): see UX_DETAILS for rationale.

## Activity log

- 2026-04-25 — created
- 2026-04-25 — STORY-005 re-scoped to auth + profile-shell only; conversational onboarding agent split into [STORY-053](../stories/STORY-053-conversational-onboarding-agent.md) under EPIC-004 (Path A scope confirmation).
