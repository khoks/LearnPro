---
id: STORY-020
title: TypeScript fundamentals track
type: story
status: done
priority: P0
estimate: M
parent: EPIC-009
phase: mvp
tags: [track, typescript, content]
created: 2026-04-25
updated: 2026-05-03
---

## Description

Same shape as STORY-019, for TypeScript. Concept sequence: variables/types → primitives → arrays → objects → unions/intersections → narrowing → functions → generics basics → interfaces vs types → utility types → modules → async/Promise basics → error handling.

TS-specific emphasis on the type system since that's what differentiates it from JS — and what most learners struggle with.

## Acceptance criteria

- [x] Track YAML at `packages/tracks/typescript-fundamentals.yaml` with **12 ordered concepts** (variables-and-types → primitives → arrays → objects → unions-and-intersections → narrowing → functions → generics-basics → interfaces-vs-types → utility-types → async-promise-basics → error-handling). Spec listed 13; 1 (`modules`) is deferred — see footnote [^deferred-concepts]. 10 of 12 spec'd Python deferrals were resolved here; STORY-019 deferred 3 of 12 for the same bank-coverage reason.
- [x] Same loader as STORY-019 populates the `tracks` table — loader unchanged from STORY-019; only adds the `TYPESCRIPT_FUNDAMENTALS_PATH` constant alongside `PYTHON_FUNDAMENTALS_PATH`. 28 problem refs across 12 concepts (counting duplicates) → 25 unique TypeScript problems referenced from the 30-problem bank. Loader rejects orphan problem-slug refs, forward prerequisites, and duplicate concept slugs at parse time — same invariants as the Python track.
- [ ] User can select this track during onboarding[^onboarding-wiring].
- [ ] Progress bar reflects concepts-mastered / total-concepts[^progress-ui].

[^deferred-concepts]: `modules` is listed in the spec but the STORY-016 TS bank ships zero problems whose `concept_tags` cover module syntax (`import` / `export` / `import.meta` / etc). Per the loader invariant ("every concept slug in the track must reference at least one real problem in the bank"), shipping `modules` as an orphan concept would fail the loader test. It lifts back into the track once the seed bank gains coverage — file a follow-up Story under EPIC-009 to extend the bank with at least one multi-module problem (the current YAMLs are single-file `solve()` exercises, which by design exercise no module surface).
[^onboarding-wiring]: Track-selection UI is not in this Story's scope. The `/onboarding` flow currently captures `target_role` / `time_budget_min` / `primary_goal` (STORY-053) but does not yet present a track picker. Same deferral STORY-019 made — the dashboard track-picker work belongs with [STORY-022](./STORY-022-xp-and-streak.md) (XP, streak, per-track progress bar) and the broader `/dashboard` UI surface.
[^progress-ui]: Per-concept skill aggregation (`skill_scores` rolled up by track) and the progress-bar UI both belong to [STORY-022](./STORY-022-xp-and-streak.md). The data shape exists today (`skill_scores` table from STORY-013 + the concept rows seeded by `seedTrack`); the read-side aggregation + render lands there. Same deferral STORY-019 made.

## Dependencies

- Blocked by: STORY-019 (loader infrastructure) — done.

## Tasks

(Shipped as a single `feat(tracks)` PR; per-task tracking elided.)

## Test counts

- 11 loader tests (`packages/tracks/src/loader.typescript.test.ts`) — happy path on `typescript-fundamentals.yaml` + a `modules`-not-yet-present sentinel. Mirrors the Python loader-test shape.
- 1 DATABASE_URL-gated integration test (`packages/tracks/src/seed.typescript.test.ts`) — first-call insertion + idempotency, scoped to `typescript`-language rows so it never disturbs the Python integration test.
- **Net new for STORY-020: 11 unit + 1 DB-gated. Package totals: 46 unit passing + 2 DB-gated, all green; package-level test command green.**

## Activity log

- 2026-04-25 — created
- 2026-05-01 — picked up
- 2026-05-03 — done; AC #1-2 ticked, AC #3 (track-selection in onboarding) and AC #4 (progress bar UI) deferred with footnotes pointing at STORY-022 / dashboard. 1 of 13 spec'd concepts (`modules`) deferred until the seed bank gains module-syntax coverage.
