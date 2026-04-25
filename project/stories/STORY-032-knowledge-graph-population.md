---
id: STORY-032
title: Populate knowledge graph with 200+ concepts and prerequisite edges
type: story
status: backlog
priority: P1
estimate: L
parent: EPIC-005
phase: v1
tags: [profile, knowledge-graph, content, v1]
created: 2026-04-25
updated: 2026-04-25
---

## Description

The MVP knowledge-graph schema (concepts + prerequisites) lands empty or sparsely populated. To make adaptive planning actually adaptive ("user is failing React hooks → check JS closures first"), the graph needs to be filled in.

Enumerate ~200 concepts spanning Python fundamentals, TypeScript fundamentals, DSA, and framework basics. Encode prerequisite edges between them. Validate by simulating a learner walking the graph from "knows nothing" to "mastered React" and checking that the order makes pedagogical sense.

## Acceptance criteria

- [ ] At least 200 concept nodes populated in the `concepts` table, with: name, description (1–2 sentences), default difficulty band, owning track(s), tags.
- [ ] At least 400 prerequisite edges in the `prerequisites` table.
- [ ] The MVP curated problem bank ([STORY-016](STORY-016-seed-bank.md)) is fully tagged against the populated concepts (every problem touches ≥ 1 concept).
- [ ] A simulated walk from `python.basics.variables` to `python.advanced.metaclasses` follows a sensible order (validated by hand).
- [ ] No prerequisite cycles (enforced by a CI check).
- [ ] Adding a new concept requires editing only YAML/JSON, not code.

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
