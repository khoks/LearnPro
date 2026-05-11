---
id: STORY-038b
title: Comprehension difficulty calibration (STORY-038 follow-up)
type: story
status: in-progress
priority: P2
estimate: S
parent: STORY-038
phase: v1-followup
tags: [scoring, comprehension, difficulty, v1-followup]
created: 2026-05-11
updated: 2026-05-11
---

## Description

Deferred follow-up from [STORY-038](STORY-038-read-this-code-exercises.md). STORY-038 shipped the
`kind: "comprehension"` problem branch and STORY-038a wired the tutor route to grade them — but the
heuristic `difficultySignal` in `packages/scoring/src/difficulty.ts` was built for `kind: "implement"`
episodes (it reads `tests_passed`, `tests_total`, `time_to_first_attempt`, etc.).

For comprehension episodes those inputs are nonsensical:

- Multiple-choice problems are binary correct/incorrect with no partial credit.
- Free-text problems are graded 1-5 by a rubric (Haiku).
- There are no hidden tests; the user reads code, doesn't write it.
- Code-quality signals (idiomatic, efficiency) don't apply.

So this Story adds a comprehension-specific branch in `episodeSuccessScore` and `difficultySignal`,
calibrated for the two comprehension answer formats. The existing implement/debug branch stays
unchanged. The new branch is purely additive.

## Acceptance criteria

- [x] Multiple-choice comprehension episode: success score = 1.0 on first-try correct (no hints),
      0.6 if correct after 1 hint, 0.3 if correct after 2+ attempts, 0.0 if never correct.
- [x] Free-text comprehension episode: success score = clamp((rubric_score - 1) / 4, 0, 1).
      rubric=5 → 1.0, rubric=3 → 0.5, rubric=1 → 0.0.
- [x] Time signal uses per-problem `expected_time_sec` (default 60s for multiple_choice, 180s for
      free_text). Slow + many hints → step down; fast + no hints + high score → step up.
- [x] The existing `kind: "implement"` / `kind: "debug"` path stays unchanged.
- [x] The comprehension difficulty signal is wired into the grade tool's comprehension path so a
      comprehension submission can produce a calibrated `difficultySignal` + `episodeSuccessScore`.
- [x] ~10-12 new tests in `packages/scoring/src/difficulty.test.ts` covering both answer formats.
- [x] ~3-4 new tests in `packages/agent/src/tools/grade.test.ts` asserting the signal is computed
      correctly from a comprehension submission shape.

## Implementation outline

1. `packages/scoring/src/difficulty.ts`:
   - Add a new `ComprehensionEpisodeSignalInputSchema` (Zod) carrying
     `comprehension_format`, `correct`, `rubric_score?`, `time_to_answer_sec`,
     `attempt_count`, `hint_count`, `expected_time_sec?`.
   - Export `comprehensionEpisodeSuccessScore` + `comprehensionDifficultySignal` +
     `nextComprehensionDifficulty` pure helpers.
   - The new branch is additive: the existing `episodeSuccessScore` / `difficultySignal` /
     `nextDifficulty` for `EpisodeSignalInput` stay byte-for-byte the same.
2. `packages/scoring/src/difficulty.test.ts`:
   - New `describe("comprehension difficulty")` block with 10-12 tests.
   - Regression block confirming `kind: "implement"` path still works unchanged.
3. `packages/agent/src/tools/grade.ts`:
   - Surface the comprehension difficulty signal alongside the grade verdict when the deps adapter
     wires it. Keep additive — single optional dep, opt-in by callers, doesn't break legacy fixtures.
4. `packages/agent/src/tools/grade.test.ts`:
   - 3-4 new tests asserting the signal is computed correctly from a comprehension submission shape.

## Dependencies

- Blocked by: [STORY-038](STORY-038-read-this-code-exercises.md) (provides the comprehension schema),
  [STORY-038a](STORY-038a-comprehension-tutor-fanout.md) (provides the grade-tool dispatch fan-out).
- Pairs with: [STORY-037a](STORY-037a-debug-grader-runtime-wiring.md) (sibling scoring-axis wiring).

## Notes

- The comprehension axis EWMA already lives in `packages/scoring/src/policies/comprehension-policy.ts`
  (STORY-038) and is wired through `update-profile.ts` (STORY-038a). That axis tracks per-concept-tag
  reading accuracy; this Story is the orthogonal per-episode difficulty calibration for the
  problem-tier ladder.

## Activity log

- 2026-05-11 — created
- 2026-05-11 — picked up
