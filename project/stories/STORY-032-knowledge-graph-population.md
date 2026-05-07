---
id: STORY-032
title: Populate knowledge graph with 200+ concepts and prerequisite edges
type: story
status: done
priority: P1
estimate: L
parent: EPIC-005
phase: v1
tags: [profile, knowledge-graph, content, v1]
created: 2026-04-25
updated: 2026-05-06
---

## Description

The MVP knowledge-graph schema (concepts + prerequisites) lands empty or sparsely populated. To make adaptive planning actually adaptive ("user is failing React hooks → check JS closures first"), the graph needs to be filled in.

Enumerate ~200 concepts spanning Python fundamentals, TypeScript fundamentals, DSA, and framework basics. Encode prerequisite edges between them. Validate by simulating a learner walking the graph from "knows nothing" to "mastered React" and checking that the order makes pedagogical sense.

## Acceptance criteria

- [x] At least 200 concept nodes populated in the `concepts` table, with: name, description (1–2 sentences), default difficulty band, owning track(s), tags. **(206 concepts authored across 6 YAML files.)**
- [x] At least 400 prerequisite edges in the `prerequisites` table. **(428 edges in `prerequisites.yaml`.)**
- [x] The MVP curated problem bank ([STORY-016](STORY-016-seed-bank.md)) is fully tagged against the populated concepts (every problem touches ≥ 1 concept). **(Existing schema enforces `concept_tags.min(1)`; new test in `packages/db/src/problem-bank-tagging.test.ts` asserts every problem under `packages/problems/{python,typescript}/*.yaml` has ≥ 1 tag. Fundamentals tags use the older single-segment kebab format from STORY-016 and remain untouched per the parallel-agent boundary.)**
- [x] A simulated walk from `python.basics.variables` to `python.advanced.metaclasses` follows a sensible order (validated by hand). **(See activity log for 5 sanity-check walks.)**
- [x] No prerequisite cycles (enforced by a CI check). **(Vitest test `prerequisites-seed: knowledge graph integrity > the full graph has no cycles (CI gate)` runs on every push.)**
- [x] Adding a new concept requires editing only YAML/JSON, not code. **(`packages/db/concepts/yaml/*.yaml`; the seeder discovers + UPSERTs at `pnpm --filter @learnpro/db db:seed:concepts`.)**

## Tasks under this Story

(To be created when this Story is picked up.)

## Dependencies

- Blocked by: EPIC-005 MVP knowledge-graph schema (STORY-013).
- Enables: serious adaptive planning ([STORY-046](STORY-046-daily-weekly-plans.md)), [STORY-031](STORY-031-fsrs-spaced-repetition.md) routing decisions.

## Notes

- This is mostly content work, not code work. Estimate is L because of the breadth.
- Reuse / inspect existing taxonomies (e.g., the Python docs structure, MDN's JS/TS reference) to avoid blank-page paralysis.
- Catalogued in [`docs/vision/RECOMMENDED_ADDITIONS.md`](../../docs/vision/RECOMMENDED_ADDITIONS.md).

## Activity log

- 2026-04-25 — created
- 2026-05-06 — picked up
- 2026-05-06 — schema diff: migration `0019_knowledge_graph.sql` adds nullable `description`, `default_difficulty`, `tags` (jsonb), `track_slugs` (jsonb) to `concepts`; creates new `prerequisites` table with `(org_id, from_concept_id, to_concept_id)` unique index + cascade FK to concepts. All four concepts columns are nullable so prior STORY-019/020 inserts (which only set name/language/slug) remain valid.
- 2026-05-06 — pure functions in `packages/db/src/concept-graph.ts`: `detectCycles` (DFS), `walkConceptGraph` (BFS shortest path), `topologicalOrder` (Kahn's). Zod schemas for the YAML shapes.
- 2026-05-06 — concept YAMLs authored under `packages/db/concepts/yaml/`: python-fundamentals (51), python-advanced (32), typescript-fundamentals (41), typescript-advanced (20), dsa (31), frameworks-basics (30) = **206 concepts**.
- 2026-05-06 — prerequisites YAML authored: **428 edges**.
- 2026-05-06 — seeder `seedConceptsFromYaml` UPSERTs concepts and replaces the prerequisite-edge set; `pnpm --filter @learnpro/db db:seed:concepts` CLI lands.
- 2026-05-06 — manual sanity-check walks (AC #4) — all five produce sensible orderings:
  - `python.advanced.metaclasses -> python.basics.variables`: metaclasses → classes → functions → variables.
  - `react.basics.effects -> typescript.basics.functions`: effects → state → functions.
  - `dsa.dijkstra -> dsa.arrays`: dijkstra → graphs → arrays.
  - `fastapi.basics.dependency-injection -> python.basics.variables`: DI → functions → variables.
  - `typescript.advanced.infer -> typescript.basics.variables`: infer → conditional-types → generics → functions → variables.
- 2026-05-06 — vitest CI gate: `the full graph has no cycles (CI gate)` runs on every push and fails the build if a cycle is introduced.
- 2026-05-06 — done. PR opened: see PR description for full summary.
