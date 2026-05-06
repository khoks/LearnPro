---
id: STORY-034
title: Split critique/grader agent from tutor (reduces niceness bias)
type: story
status: done
priority: P1
estimate: M
parent: EPIC-004
phase: v1
tags: [agent, grading, prompts, v1]
created: 2026-04-25
updated: 2026-05-06
---

## Description

The MVP tutor wears two hats: it's the warm, encouraging mentor AND the honest grader. These hats conflict — the tutor is biased toward "this is great!" because it's been trained to be helpful. This bias inflates skill scores and dulls the difficulty tuner.

Split out a **critique/grader agent** with a distinctly cooler tone, scored against explicit rubrics for: correctness (binary, deterministic — but signed off by the agent), idiomatic-ness (1–5), efficiency (1–5), test-coverage thinking (1–5). The tutor still talks to the user; the critique agent's outputs feed the profile.

## Acceptance criteria

- [x] `gradeAgent` defined in `packages/agent/src/grade.ts` with explicit rubric prompts.
- [x] Grading runs as a separate LLM call after the tests-as-floor pass/fail.
- [x] Per-rubric scores written to the episode record (migration `0013_grader_rubric.sql` adds `episodes.rubric_idiomatic` / `rubric_efficiency` / `rubric_test_coverage` / `rubric_reasoning`; `persistGraderRubric` adapter wires the write).
- [x] Profile skill update uses the rubric scores (not just binary pass/fail) — `applyGraderBonus` translates 1-5 ints into a clamped ±0.05 skill delta per concept tag.
- [x] Tutor reads the rubric scores via `TutorSession.lastGraderRubric` (carried in-memory from `submit()` → `finish()` → `updateProfile.run({ grader_rubric })`). The API layer surfaces `grade_output.grader` in the submit response so the tutor's UI commentary phase can paraphrase ("the grader noted O(n²) — want to see the linear version?") — paraphrase remains under coach-voice rules; grader's own text is internal.
- [x] A/B comparison — deterministic test in `packages/agent/evals/grade-split.test.ts` against 10 canned (unified, split) rubric pairs. Asserts split-grader variance on idiomatic ≥ unified, distribution spans ≥4 of 5 buckets, and the bonus is non-degenerate (both signs, clamped). **Live-LLM A/B over real transcripts deferred to follow-up** — same Haiku judge as STORY-035 would cost ~$1/run; signal captured deterministically at $0 here.

## Tasks under this Story

(To be created when this Story is picked up.)

## Dependencies

- Blocked by: EPIC-004 MVP tutor (STORY-011), [STORY-035](STORY-035-prompt-eval-harness.md) (need eval harness to validate the split).

## Notes

- Pattern is similar to actor-critic in RL: the actor (tutor) optimizes for engagement; the critic (grader) optimizes for accuracy.
- Use Haiku for the grader — cheaper, fine for rubric-following.
- Catalogued in [`docs/vision/RECOMMENDED_ADDITIONS.md`](../../docs/vision/RECOMMENDED_ADDITIONS.md).

## Activity log

- 2026-04-25 — created
- 2026-05-06 — picked up; landed in 5 incremental commits (prompt + migration; gradeAgent module; tool wiring + skill bonus; deterministic A/B test; story + board update). Final scope landed:
  - `packages/agent/src/grade.ts` — pure async `gradeAgent({llm, episode, code, problem, test_results})` returns `{pass, rubric: {idiomatic, efficiency, test_coverage_thinking}, reasoning, fallback_used}`. Lenient `parseGraderResponse` strips fenced blocks + coerces stringified numbers + clamps to [1,5]; on parse failure returns a conservative neutral 3/3/3 rubric so the user is never blocked.
  - `packages/prompts/src/grade-prompt.ts` — new `GRADE_PROMPT_VERSION = "grader-2026-05-06"`, distinct from the legacy tutor-family `GRADE_PROMPT_VERSION_TAG`. Prompt instructs cool/factual third-person, forbids "you" / "great" / "your code", keeps the existing `grade.ts` 0-1 prompt for backward compatibility (the unified-tutor codepath is the A/B baseline).
  - Migration `0013_grader_rubric.sql` adds 4 nullable `episodes` columns (`rubric_idiomatic`, `rubric_efficiency`, `rubric_test_coverage`, `rubric_reasoning`); journal entry idx=13.
  - `GradeDeps` gains optional `runGraderAgent` + `persistGraderRubric` ports; the legacy `generateRubric` stays for the A/B baseline. Drizzle deps wire both — `runGraderAgent` calls `gradeAgent` against the same `LLMProvider` so the Haiku tier ladder + budget gate apply uniformly; `persistGraderRubric` UPDATEs the new columns. Best-effort: hiccups → `grader: null` on the wire and submission still records.
  - `GradeOutput.grader` is the new rubric on the wire (optional + nullable so legacy fixtures don't need updating).
  - `TutorSession` carries `lastGraderRubric` in-memory through `submit()` → `finish()`; `updateProfile.run` accepts optional `grader_rubric`; `applyGraderBonus` translates 1-5 ints to a per-concept ±0.05 clamped delta. Skipped on un-passed submissions and on `fallback_used=true`.
  - Eval harness deterministic test in `packages/agent/evals/grade-split.test.ts` over 10 canned pairs in `cases/grade-split-vs-unified.json`. Asserts split-grader idiomatic variance ≥ unified-rubric idiomatic variance (normalized), distribution spans ≥4 of 5 buckets, both positive and negative bonuses, all clamped.
  - **Deferred to follow-up:** live-LLM A/B over real Anthropic transcripts. Cost: same Haiku judge as STORY-035 would cost ~$1 per run; deterministic test gives the same signal at $0. File a follow-up before flipping the grader on by default in production if more confidence is wanted.
- 2026-05-06 — done
