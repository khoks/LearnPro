---
id: STORY-037
title: Debugging exercises engine — broken code, find and fix
type: story
status: backlog
priority: P1
estimate: L
parent: EPIC-007
phase: v1
tags: [problems, content, debugging, v1]
created: 2026-04-25
updated: 2026-04-25
---

## Description

Reading and fixing broken code is closer to real engineering than greenfield problem-solving — and almost no learning platform does it. Build a debugging-exercise engine that presents intentionally-buggy code and asks the user to identify and fix the bug.

This is a strong differentiator (see [`DIFFERENTIATORS.md § 5`](../../docs/product/DIFFERENTIATORS.md)) — it explicitly trains the anti-autocomplete skill set.

## Acceptance criteria

- [ ] Problem-type extension: in addition to "implement," support "debug" (broken code is given, expected behavior is described, fix it).
- [ ] At least 4 bug archetypes per language with several problems each: off-by-one, mutation in iteration, reference equality, async race (TS), late binding (Python closures), shadowing, type coercion bugs (TS), default-arg-mutability (Python).
- [ ] At least 20 debugging problems per language (Python + TS) for v1.
- [ ] Editor pre-populates with the buggy code; tests are visible and currently failing.
- [ ] Tutor commentary recognizes "the bug was X because Y" reasoning patterns.
- [ ] Profile records "found bug correctly" as a separate skill axis from "wrote new code correctly."

## Tasks under this Story

(To be created when this Story is picked up.)

## Dependencies

- Blocked by: EPIC-007 MVP problem framework (STORY-016).
- Pairs with: [STORY-038](STORY-038-read-this-code-exercises.md) (similar comprehension-axis content).

## Notes

- Most debug problems can be authored from existing curated problems by introducing a single bug archetype each.
- Catalogued in [`docs/vision/RECOMMENDED_ADDITIONS.md`](../../docs/vision/RECOMMENDED_ADDITIONS.md).

## Activity log

- 2026-04-25 — created
