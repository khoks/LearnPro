---
id: STORY-038
title: "Read this code" comprehension exercises (predict, trace, complexity)
type: story
status: done
priority: P1
estimate: L
parent: EPIC-007
phase: v1
tags: [problems, content, comprehension, v1]
created: 2026-04-25
updated: 2026-05-06
---

## Description

Reading is 80% of real engineering work. Comprehension exercises test a different skill axis than producing code, and almost no learning platform exercises this axis explicitly.

Three sub-formats:
1. **Predict the output** — "What does this function return for input X?"
2. **Trace the execution** — "What's the value of `result` after line 6?"
3. **Reason about properties** — "What's the time complexity?", "Where would adding a cache help?", "What's the bug here?", "Why does this work despite the apparent off-by-one?"

## Acceptance criteria

- [x] Problem-type extension: support "comprehension" question type with multiple-choice or free-text answer.
- [x] At least 30 comprehension problems per language for v1 (mix of all three sub-formats).
- [x] Free-text answers graded by LLM rubric (factual correctness only — not style).
- [x] Multiple-choice answers graded deterministically.
- [x] Profile records "comprehension accuracy" as a separate skill axis.
- [x] Tutor commentary on free-text answers explains the *why* of the correct answer in 2–3 sentences.

## Deferred (follow-ups)

- Difficulty calibration for the comprehension axis (different from coding axis) — defer.
- Multi-step comprehension (e.g. "trace 3 steps") — single-step only for now.
- Wiring the comprehension grader into the assigner / API tutor route end-to-end — the components
  ship in this Story; the tutor-route fan-out lives in a follow-up Story so the discriminated
  assign/grade flow can be threaded carefully.

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
- 2026-05-06 — picked up
- 2026-05-06 — done. Schema discriminator extended to `kind: "comprehension"` with the three
  sub-formats (predict_output / trace_execution / reason_property) and two answer formats
  (multiple_choice / free_text). Migration 0020 widens the `problems.kind` CHECK and adds
  `comprehension_format` + `answer_format` columns. 38 Python + 30 TS comprehension YAMLs
  authored. `gradeComprehension()` lives in @learnpro/agent — deterministic for multiple-choice,
  Haiku LLM rubric for free-text via the new `comprehension-grade-prompt`. Scoring adds a
  per-concept-tag comprehension-accuracy EWMA axis (mirrors bug-finding shape). UI adds
  ComprehensionProblemPanel + ComprehensionAnswerWidget + ComprehensionGradeResultPanel +
  blue "Read" KindBadge. Tutor commentary helper builds the warm/coach-voice "Here is why" and
  "What good looks like" prose. End-to-end wiring of the comprehension grader into the API
  tutor route deferred to a follow-up Story (the discriminated assign/grade fan-out needs care).
- 2026-05-11 — follow-up [STORY-038b](STORY-038b-comprehension-difficulty-calibration.md) shipped
  the comprehension-axis difficulty calibration deferred above. `packages/scoring/src/difficulty.ts`
  gains `comprehensionEpisodeSuccessScore` + `comprehensionDifficultySignal` +
  `nextComprehensionDifficulty` (Zod discriminated union on `comprehension_format`); the grade
  tool surfaces a calibrated `comprehension_signal` on `GradeOutput`. Implement/debug branch stays
  unchanged. 27 new tests.
