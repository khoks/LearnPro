---
id: STORY-039
title: LLM-generated problem variants (same shape, different cover)
type: story
status: backlog
priority: P2
estimate: M
parent: EPIC-007
phase: v1
tags: [problems, llm, content, v1]
created: 2026-04-25
updated: 2026-04-25
---

## Description

Curated bank gives ~30 problems per language at MVP — eventually users will see them all. Extend the bank by using the LLM to generate **variants** of curated seeds: same algorithm/concept, different cover story (e.g., "find the max of a list" → "find the highest score among players in a tournament").

Variants must pass an automated quality gate before being shown to users: spec-clarity check, hidden-test correctness check, novelty check (not too similar to its parent or to other variants).

## Acceptance criteria

- [ ] Variant-generation pipeline in `packages/problems/variants/` with: prompt templates, quality-gate runner, persistent storage.
- [ ] Each variant references its `parent_problem_id` for traceability.
- [ ] Quality gate runs: (a) reference solution passes hidden tests, (b) LLM judge rates spec-clarity ≥ 4/5, (c) novelty score (embedding distance from parent) above threshold.
- [ ] Failed-gate variants are stored but not surfaced; admin tool lets us inspect why.
- [ ] At least 100 variants generated across the existing 60 seeds for v1 launch.
- [ ] Per-user "you've already seen this seed" tracking — variants are surfaced when the user has done the parent.

## Tasks under this Story

(To be created when this Story is picked up.)

## Dependencies

- Blocked by: EPIC-007 MVP problem framework + curated bank (STORY-016).

## Notes

- Bank stays curated — variants augment, not replace.
- LLM cost: ~$0.10 per variant attempt (incl. quality gate). 100 variants ≈ $20–40 to generate, then static.
- Catalogued in [`docs/vision/RECOMMENDED_ADDITIONS.md`](../../docs/vision/RECOMMENDED_ADDITIONS.md).

## Activity log

- 2026-04-25 — created
