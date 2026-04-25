---
id: STORY-030
title: Backlog expansion (40–60 new ideas, 15+ filed as stories)
type: story
status: done
priority: P0
estimate: L
parent: EPIC-017
phase: scaffolding
tags: [product, backlog, ideas, grooming]
created: 2026-04-25
updated: 2026-04-25
---

## Description

Phase C of the product-grooming pass. Generate a structured catalog of 40–60 new feature ideas across all 16 epics. Each idea: brief description, rationale (why this matters), target phase (mvp/v1/v2/v3), related epic, tradeoffs/alternatives.

Then file the most important 15–20 as actual STORY files in `project/stories/` so they show up in the backlog. The rest go into `docs/vision/RECOMMENDED_ADDITIONS.md` as a longer "deferred / consider later" list.

The discipline: only file as a Story if (a) it reinforces the differentiators (Phase B output), (b) someone could start work on it in v1 or v2, and (c) it's specific enough to estimate. Otherwise it stays in the catalog as a half-baked idea — useful to remember, not yet committed.

## Acceptance criteria

- [x] 40+ new feature ideas catalogued (across all 16 epics + cross-cutting).
- [x] Each idea has rationale, target phase, related epic, tradeoffs.
- [x] At least 15 new STORY files filed in `project/stories/` (numbered STORY-031+).
- [x] `RECOMMENDED_ADDITIONS.md` updated with the broader catalog.
- [x] BOARD.md updated to surface the new stories in the backlog table.

## Dependencies

- Blocked by: STORY-028 (differentiators), STORY-029 (UX details may surface natural follow-on ideas).

## Activity log

- 2026-04-25 — created
- 2026-04-25 — picked up; in-progress
- 2026-04-25 — done. `RECOMMENDED_ADDITIONS.md` rewritten as a 116-idea catalog organized by epic with "Filed?" column. 20 new STORY files filed (STORY-031..STORY-050) — 16 v1, 4 v2 — across EPICs 002, 003, 004, 005, 006, 007, 012, 013, 016. Discipline applied: only filed if (a) reinforces a differentiator, (b) startable in v1/v2, (c) specific enough to estimate.
