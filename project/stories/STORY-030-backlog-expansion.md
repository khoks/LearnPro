---
id: STORY-030
title: Backlog expansion (40–60 new ideas, 15+ filed as stories)
type: story
status: backlog
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

- [ ] 40+ new feature ideas catalogued (across all 16 epics + cross-cutting).
- [ ] Each idea has rationale, target phase, related epic, tradeoffs.
- [ ] At least 15 new STORY files filed in `project/stories/` (numbered STORY-031+).
- [ ] `RECOMMENDED_ADDITIONS.md` updated with the broader catalog.
- [ ] BOARD.md updated to surface the new stories in the backlog table.

## Dependencies

- Blocked by: STORY-028 (differentiators), STORY-029 (UX details may surface natural follow-on ideas).

## Activity log

- 2026-04-25 — created
