---
id: STORY-031
title: FSRS spaced-repetition scheduler for concept review
type: story
status: done
priority: P1
estimate: M
parent: EPIC-005
phase: v1
tags: [profile, retention, fsrs, spaced-repetition, v1]
created: 2026-04-25
updated: 2026-05-01
---

## Description

As a learner, I want the system to surface review problems on the right cadence so I don't lose what I've already learned. As a system, we need a real memory-decay algorithm — not just notifications — so "skill decay prevention" actually works.

Implement FSRS (Free Spaced Repetition Scheduler) over the per-concept skill scores. After each successful application of a concept, schedule the next review based on FSRS parameters (stability, difficulty, recall probability). The scheduler outputs a per-user review queue that the session-plan agent (EPIC-006) consults when generating today's plan.

## Acceptance criteria

- [x] FSRS algorithm implemented as a pure wrapper around `ts-fsrs@5.3.2` (MIT, zero deps) in `packages/scoring/src/policies/spaced-repetition.ts`. Per the lock-in note in CLAUDE.md, we use the well-maintained TS port instead of porting the FSRS-5 formulas ourselves.
- [x] Per-concept FSRS state lives in a new `concept_reviews` table (migration `0011_concept_reviews.sql`) keyed on (user_id, concept_id) with the persisted state columns (stability, difficulty, due, lapses, last_reviewed). The `scores` table from STORY-013 is unchanged — keeping FSRS state separate from the EWMA skill score lets a future adaptive policy swap one without touching the other.
- [x] After each episode close, `updateProfile` writes one FSRS card-state row per resolved concept tag using `mapEpisodeOutcomeToGrade()` (revealed/failed/abandoned → again, passed_with_hints → hard|good, passed → easy|good per under-target time).
- [x] `getDueConcepts(db, user_id, now)` returns the user's currently-due concept ids (state.due ≤ now), capped at 50 per spec; the API exposes the join-with-slug-and-name shape via `GET /v1/spaced-repetition/due`.
- [x] The tutor's `assignProblem` consumes the due-list as a **secondary** signal — it breaks final-stage ties toward problems whose concept_tags overlap with the due-set, but never overrides difficulty or recency. `review_session_suggested=true` surfaces in the response when due ≥ 3.
- [x] Unit tests: 36 in @learnpro/scoring (cold-start, post-cold-start grades, isDue edge cases, grade-mapping per outcome, end-to-end determinism); 11 new in @learnpro/agent on the tie-break + review-write paths; 5 endpoint tests + 6 component tests for the dashboard surface.

## Out-of-scope (left for follow-up Stories)

- **Session-plan integration**: STORY-046 (daily/weekly plan views) is the right Story to make the planner actually mix in a review objective when due ≥ 1. STORY-031 keeps the surface area scoped to the data model + assigner tie-break + dashboard CTA.
- **Review-session UI**: the dashboard CTA links to `/session?track=...&review=1` — the `review=1` query param is currently a no-op in the session UI but reserved for STORY-046's review-session view (post-PR work).

## Tasks under this Story

(Done inline — committed in 5 incremental WIPs per the parallel-agent dispatch playbook, then squashed at PR merge.)

## Dependencies

- Blocked by: EPIC-005 MVP profile schema (STORY-013) — needs `scores` table. **Unblocked.**
- Blocks: smarter session planning ([STORY-046](STORY-046-daily-weekly-plans.md)) — daily/weekly views consume the review queue.

## Notes

- Algorithm reference: <https://github.com/open-spaced-repetition/ts-fsrs> (FSRS-5).
- Storage choice: we persist only the trimmed projection (stability/difficulty/due/lapses/last_reviewed) and rebuild the rest from `createEmptyCard()` + the algorithm's defaults on each recompute. Keeps the jsonb shape stable across ts-fsrs minor versions; corruption is self-healing — a malformed payload collapses to null and the next graded review writes a fresh, validated state back.
- The "fading" notion in MVP mastery rule (skill ≥ 0.8 + last successful within 14 days) is now a special case of FSRS: a fading concept is one whose card has crossed `state.due`. The dashboard's `<DueReviewsCard>` exposes that.
- Catalogued in [`docs/vision/RECOMMENDED_ADDITIONS.md`](../../docs/vision/RECOMMENDED_ADDITIONS.md) (FSRS spaced repetition).

## Activity log

- 2026-04-25 — created
- 2026-05-01 — picked up
- 2026-05-01 — done (5 WIP commits squash-merged at PR; 58 new tests; ts-fsrs@5.3.2 pinned; Next.js build clean)
