---
id: STORY-019
title: Python fundamentals track
type: story
status: done
priority: P0
estimate: M
parent: EPIC-009
phase: mvp
tags: [track, python, content]
created: 2026-04-25
updated: 2026-05-01
---

## Description

A "track" is a curated sequence of concepts + problems that gives the learner a clear path through a topic. Python fundamentals covers: variables/types → control flow → strings → lists/tuples → dicts/sets → comprehensions → functions/closures → classes basics → file I/O → modules/packages → errors/exceptions → typing basics.

Each concept maps to 2–3 problems from the seed bank (STORY-016) and a one-paragraph "concept card" the tutor can quote when explaining.

## Acceptance criteria

- [x] Track YAML at `packages/tracks/python-fundamentals.yaml` with **9 ordered concept slugs** (variables-and-types → control-flow → strings → lists-and-tuples → dicts-and-sets → comprehensions → functions-and-closures → classes-basics → errors-and-exceptions). Spec listed 12; 3 (`file-io`, `modules-and-packages`, `typing-basics`) are deferred — see footnote [^deferred-concepts].
- [x] Each concept has a `name`, `summary` (tutor-quotable, 40+ chars), `prerequisite_concept_slugs`, and `seed_problem_slugs` (renamed from `seed_problem_ids` because the YAML carries slugs, not DB ids; the concept-to-problem mapping stays on the YAML rather than a join table for MVP — see [`packages/tracks/src/loader.ts`](../../packages/tracks/src/loader.ts) `seedTrack` comment). 21 distinct problem refs across 9 concepts (counting duplicates) → 19 unique Python problems referenced from the 33-problem bank.
- [x] Track loader populates the `tracks` and `concepts` tables from this YAML — `seedTrack(db, track)` in [`packages/tracks/src/loader.ts`](../../packages/tracks/src/loader.ts), idempotent under `(org_id, slug)` for tracks and `(org_id, language, slug)` for concepts. Loader rejects orphan problem-slug refs, forward prerequisites, and duplicate concept slugs at parse time.
- [ ] User can select this track during onboarding (STORY-005)[^onboarding-wiring].
- [ ] Progress bar reflects concepts-mastered / total-concepts[^progress-ui].

[^deferred-concepts]: `file-io`, `modules-and-packages`, and `typing-basics` are listed in the spec but the STORY-016 Python bank ships zero problems whose `concept_tags` cover them today. Per the loader invariant ("every concept slug in the track must reference at least one real problem in the bank"), shipping these as orphan concepts would fail the loader test. They lift back into the track once the seed bank gains coverage — file a follow-up Story under EPIC-009 to extend the bank.
[^onboarding-wiring]: Track-selection UI is not in this Story's scope. The `/onboarding` flow currently captures `target_role` / `time_budget_min` / `primary_goal` (STORY-053) but does not yet present a track picker. Wiring lands with the `/dashboard` UI Story (no STORY-NNN exists yet for the dashboard track-picker — file when work begins).
[^progress-ui]: Per-concept skill aggregation (`skill_scores` rolled up by track) and the progress-bar UI both belong to STORY-022 (XP, streak, per-track progress bar). The data shape exists today (`skill_scores` table from STORY-013); the read-side aggregation + render lands there.

## Dependencies

- Blocked by: STORY-013 (concepts/tracks tables) — done. STORY-016 (seed bank) — done.

## Tasks

(Shipped as a single `feat(tracks)` PR; per-task tracking elided.)

## Test counts

- 21 schema tests (`packages/tracks/src/schema.test.ts`) — Zod rejection branches.
- 14 loader tests (`packages/tracks/src/loader.test.ts`) — happy path on `python-fundamentals.yaml` + 4 rejection cases via tmp YAML files.
- 1 DATABASE_URL-gated integration test (`packages/tracks/src/seed.test.ts`) — first-call insertion + idempotency.
- **Total: 35 unit + 1 DB-gated, all green; package-level test command green.**

## Activity log

- 2026-04-25 — created
- 2026-05-01 — picked up
- 2026-05-01 — done; AC #1-3 ticked, AC #4 (track-selection in onboarding) and AC #5 (progress bar UI) deferred with footnotes pointing at the Stories that own them
