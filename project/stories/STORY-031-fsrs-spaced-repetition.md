---
id: STORY-031
title: FSRS spaced-repetition scheduler for concept review
type: story
status: backlog
priority: P1
estimate: M
parent: EPIC-005
phase: v1
tags: [profile, retention, fsrs, spaced-repetition, v1]
created: 2026-04-25
updated: 2026-04-25
---

## Description

As a learner, I want the system to surface review problems on the right cadence so I don't lose what I've already learned. As a system, we need a real memory-decay algorithm — not just notifications — so "skill decay prevention" actually works.

Implement FSRS (Free Spaced Repetition Scheduler) over the per-concept skill scores. After each successful application of a concept, schedule the next review based on FSRS parameters (stability, difficulty, recall probability). The scheduler outputs a per-user review queue that the session-plan agent (EPIC-006) consults when generating today's plan.

## Acceptance criteria

- [ ] FSRS algorithm implemented in `packages/profile/fsrs.ts` (port a known-good open implementation; do NOT roll our own).
- [ ] Per-concept FSRS state (stability, difficulty, last_review, next_review) added to the `scores` table.
- [ ] After each episode, scheduler updates the FSRS state based on correctness + hint usage.
- [ ] A `getReviewQueue(userId, limit)` function returns the top N concepts due for review, sorted by overdue-ness.
- [ ] Session-plan agent uses `getReviewQueue` to mix in 1 review-objective per session when items are due.
- [ ] Unit tests cover: first-review scheduling, successful review extending interval, failed review shortening interval, fading-concept detection.

## Tasks under this Story

(To be created when this Story is picked up.)

## Dependencies

- Blocked by: EPIC-005 MVP profile schema (STORY-013) — needs `scores` table.
- Blocks: smarter session planning ([STORY-046](STORY-046-daily-weekly-plans.md)) — daily/weekly views consume the review queue.

## Notes

- Algorithm reference: <https://github.com/open-spaced-repetition/fsrs.js> (or equivalent TS port). Known-good is critical — bugs in the scheduler are silent and corrupt the profile.
- The "fading" notion in MVP mastery rule (skill ≥ 0.8 + last successful within 14 days) becomes a special case of FSRS: a fading concept is one whose recall-probability has dropped below threshold.
- Catalogued in [`docs/vision/RECOMMENDED_ADDITIONS.md`](../../docs/vision/RECOMMENDED_ADDITIONS.md) (FSRS spaced repetition).

## Activity log

- 2026-04-25 — created
