---
id: STORY-034
title: Split critique/grader agent from tutor (reduces niceness bias)
type: story
status: backlog
priority: P1
estimate: M
parent: EPIC-004
phase: v1
tags: [agent, grading, prompts, v1]
created: 2026-04-25
updated: 2026-04-25
---

## Description

The MVP tutor wears two hats: it's the warm, encouraging mentor AND the honest grader. These hats conflict — the tutor is biased toward "this is great!" because it's been trained to be helpful. This bias inflates skill scores and dulls the difficulty tuner.

Split out a **critique/grader agent** with a distinctly cooler tone, scored against explicit rubrics for: correctness (binary, deterministic — but signed off by the agent), idiomatic-ness (1–5), efficiency (1–5), test-coverage thinking (1–5). The tutor still talks to the user; the critique agent's outputs feed the profile.

## Acceptance criteria

- [ ] `gradeAgent` defined in `packages/agent/grade.ts` with explicit rubric prompts.
- [ ] Grading runs as a separate LLM call after the tests-as-floor pass/fail.
- [ ] Per-rubric scores written to the episode record.
- [ ] Profile skill update uses the rubric scores (not just binary pass/fail).
- [ ] Tutor reads the rubric scores and references them in its commentary ("this passes, but the grader noted O(n²) — want to see the linear version?").
- [ ] A/B comparison (in the eval harness — [STORY-035](STORY-035-prompt-eval-harness.md)) shows the split agent gives more discriminating idiomatic-ness scores than the unified tutor.

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
