---
id: STORY-038
title: "Read this code" comprehension exercises (predict, trace, complexity)
type: story
status: backlog
priority: P1
estimate: L
parent: EPIC-007
phase: v1
tags: [problems, content, comprehension, v1]
created: 2026-04-25
updated: 2026-04-25
---

## Description

Reading is 80% of real engineering work. Comprehension exercises test a different skill axis than producing code, and almost no learning platform exercises this axis explicitly.

Three sub-formats:
1. **Predict the output** — "What does this function return for input X?"
2. **Trace the execution** — "What's the value of `result` after line 6?"
3. **Reason about properties** — "What's the time complexity?", "Where would adding a cache help?", "What's the bug here?", "Why does this work despite the apparent off-by-one?"

## Acceptance criteria

- [ ] Problem-type extension: support "comprehension" question type with multiple-choice or free-text answer.
- [ ] At least 30 comprehension problems per language for v1 (mix of all three sub-formats).
- [ ] Free-text answers graded by LLM rubric (factual correctness only — not style).
- [ ] Multiple-choice answers graded deterministically.
- [ ] Profile records "comprehension accuracy" as a separate skill axis.
- [ ] Tutor commentary on free-text answers explains the *why* of the correct answer in 2–3 sentences.

## Tasks under this Story

(To be created when this Story is picked up.)

## Dependencies

- Blocked by: EPIC-007 MVP problem framework (STORY-016).
- Pairs with: [STORY-037](STORY-037-debugging-exercises.md) (similar axis).

## Notes

- Comprehension problems are easier to LLM-generate than implementation problems — variants are cheaper (see [STORY-039](STORY-039-llm-problem-variants.md)).
- Catalogued in [`docs/vision/RECOMMENDED_ADDITIONS.md`](../../docs/vision/RECOMMENDED_ADDITIONS.md).

## Activity log

- 2026-04-25 — created
