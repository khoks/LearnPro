---
id: STORY-039c
title: Per-user "already seen the seed" tracking for problem variants
type: story
status: done
priority: P2
estimate: M
parent: EPIC-007
phase: v1-followup
tags: [problems, llm, variants, assigner, v1-followup]
created: 2026-05-11
updated: 2026-05-11
---

## Description

STORY-039 shipped the LLM-generated problem-variant pipeline + cache. AC #6
("per-user already seen the seed" tracking) was deferred to a follow-up — this
Story closes it.

When a user has already closed an episode on a source seed, the
`assign-problem` tool prefers a cached generated variant of that source over
re-serving the exact same problem. Cold-start (no closed episodes for the
chosen candidate) keeps the existing behaviour: return the original seed.

The decision lives entirely inside `pickCandidate`. The DB-backed deps adapter
loads two new bits of context — the set of source slugs the user has closed
episodes for, and a per-source map of unattempted variants — and hands them to
the tool. Both deps are optional on `AssignProblemDeps` so the tool stays
back-compat for tests / call sites that don't wire them.

## Acceptance criteria

- [x] `loadSeenSourceSlugs({ user_id }): Promise<string[]>` optional dep on
  `AssignProblemDeps`.
- [x] `pickCandidate` extended: when the chosen candidate's slug is in the
  seen-set AND the cached `problem_variants` map has an unattempted variant for
  that source, swap to the variant.
- [x] Drizzle deps adapter wires `loadSeenSourceSlugs` from the `episodes` table
  (joined with `problems`, `final_outcome IS NOT NULL`, distinct slug).
- [x] Drizzle deps adapter wires the unattempted-variants map from
  `problem_variants` joined with `episodes` (variant rows whose
  `is_variant_of_problem_id` has no episode for the user).
- [x] Migration `0024_episode_variant_of.sql` adds nullable
  `episodes.is_variant_of_problem_id uuid` (FK → `problems.id`, set null on
  delete). Indexed for the per-user lookup.
- [x] Tests cover: cold-start (no seen → original); seen-with-variant →
  variant; seen-without-variant → original.

## Tasks under this Story

(All scope is inside this Story; no separate Task files.)

## Dependencies

- Blocked by: STORY-039 (LLM-generated problem variants — shipped 2026-05-06).

## Notes

- The `is_variant_of_problem_id` column is the canonical link from an episode
  back to the seed when the served problem was a generated variant. The
  assign-problem tool sets it through `createEpisode` (extended below); the
  drizzle adapter writes it into the `episodes` row.
- The unattempted-variants map is keyed by the SOURCE problem id (uuid), not
  the source slug — the variant rows already carry `source_problem_id`. The
  catalog entries the assigner sees carry both `problem_id` and `problem_slug`,
  so the map lookup is by `problem_id`.

## Activity log

- 2026-05-11 — created + picked up (re-dispatch — previous agent stalled).
- 2026-05-11 — Step 1: STORY file + migration 0024 + `episodes.is_variant_of_problem_id` column.
- 2026-05-11 — Step 2: `loadSeenSourceSlugs` + `loadUnattemptedVariantsBySource` ports on `AssignProblemDeps`; `createEpisode` gains optional `is_variant_of_problem_id`; `ProblemCatalogEntry` gains optional `source_problem_id`.
- 2026-05-11 — Step 3: `pickCandidate` extended with `seen_slugs` + `unattempted_variants_by_source`; `maybeSwapToVariant` runs AFTER the existing difficulty + recency + due-concept selection. 7 new tests (4 pickCandidate + 2 createAssignProblemTool e2e + 1 helper). All 419 agent tests pass.
- 2026-05-11 — Step 4: drizzle adapter wires both ports. `loadSeenSourceSlugs` is a distinct-slug join on `episodes` × `problems` where `final_outcome IS NOT NULL`. `loadUnattemptedVariantsBySource` reads `problem_variants`, promotes each variant atomically into `problems` (idempotent via the unique `(org_id, track_id, slug)` index), excludes already-attempted entries, and returns the Map keyed by source uuid. `createEpisode` writes the new `episodes.is_variant_of_problem_id`. All packages typecheck; 419 pure agent tests + 359 apps/api tests still pass.
- 2026-05-11 — done.

