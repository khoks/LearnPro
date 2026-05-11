---
id: STORY-034a
title: Live-LLM A/B eval for the grader split (STORY-034 follow-up)
type: story
status: done
priority: P2
estimate: S
parent: EPIC-004
phase: v1-followup
tags: [agent, eval, grading, prompts, follow-up]
created: 2026-05-11
updated: 2026-05-11
---

## Description

STORY-034 shipped the split critique/grader agent (`gradeAgent` in
`packages/agent/src/grade.ts`) and a deterministic A/B test that asserts the
split rubric's range-normalized variance is greater than the unified rubric's
over a canned 10-sample fixture. The headline AC #6 ("split-grader is more
discriminating") is captured at $0 there — but the same comparison driven by
**real LLM calls** over real student transcripts was deferred as a follow-up.

This Story wires that live-LLM A/B comparison onto STORY-035's prompt-eval
harness. For each transcript in a new case file, it runs BOTH the
unified-tutor grade prompt AND the new `gradeAgent` split-grader prompt, then
records discriminating-power metrics (idiomatic-score variance, distinct
buckets used, tutor-commentary forbidden-phrase rate) and emits a markdown
report an operator can commit.

Gated by `LEARNPRO_RUN_LIVE_LLM_EVAL=1` so CI's prompt-eval workflow stays
inside the existing $0.50-$2 envelope; manual operator runs surface real
metrics for ~$1-2.

## Acceptance criteria

- [ ] New eval case file `packages/agent/evals/cases/grade-split-vs-unified-live.json`
  with 5-10 representative student transcripts (mix of clean solves,
  brute-force passes, off-by-one failures, type-coercion bugs across
  Python + TypeScript).
- [ ] Eval harness extended with an "A/B grader" mode at
  `packages/agent/evals/grader-ab.ts` (new sibling to `runner.ts`): for each
  transcript, run BOTH the unified-tutor grade path (`buildGradeSystemPrompt`)
  AND the split grader (`buildGradeAgentSystemPrompt`), record both rubric
  outputs, and compute three metrics:
    - idiomatic-score variance (split vs unified, range-normalized to match
      the deterministic test's methodology)
    - distinct-bucket count on idiomatic (split vs unified — split is integer
      1-5, unified is continuous so binned into 5 equal-width buckets for
      apples-to-apples)
    - tutor-commentary forbidden-phrase rate (split vs unified, scanning the
      `prose_explanation` / `reasoning` for the coach-voice forbidden phrases)
- [ ] Gated by `LEARNPRO_RUN_LIVE_LLM_EVAL=1` env (matches the existing
  pattern in STORY-035 for opt-in live LLM runs). Default CI run skips.
  Manual operator run with `ANTHROPIC_API_KEY` set surfaces real metrics.
- [ ] Markdown report at `packages/agent/evals/reports/grade-split-ab-YYYYMMDD.md`
  (operator-committed after a manual run). Cost: ~$1-2 per run.
- [ ] Forbidden-phrase test on the new prompt/case file copy
  (`grade-split-vs-unified-live.json` and any new prompt strings in the
  A/B runner) — same coach-voice rules as STORY-022 / STORY-023 / STORY-024.
- [ ] Zod schema validates the new case file structure at load time
  (matches the loader-at-the-boundary pattern of `loader.ts`).

## Tasks under this Story

(Inline; tracked via the activity log on this Story since this is a small
follow-up.)

## Dependencies

- Blocked by: [STORY-034](STORY-034-critique-agent-split.md) (split grader
  + `gradeAgent`), [STORY-035](STORY-035-prompt-eval-harness.md) (eval
  harness + Haiku judge + `LLMProvider` plumbing).

## Notes

- Deliberately scoped *not* to touch `packages/agent/src/grade.ts`,
  `apps/api`, or the core `packages/prompts` registry — this is pure eval
  tooling sitting next to the existing harness.
- Metrics chosen mirror STORY-034's deterministic A/B test so the live
  numbers are directly comparable: same variance methodology, same
  distinct-bucket framing.
- Cost shape: per transcript we burn 2 prompt-under-test calls (unified
  + split) at Haiku rates. 10 transcripts → ~$1-2 with `max_tokens=500`.
  We deliberately skip the per-tag judge-LLM layer for this report — the
  goal is rubric-output statistics, not pass/fail on coach-voice tags.

## Activity log

- 2026-05-11 — created + picked up
