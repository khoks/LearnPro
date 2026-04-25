---
id: STORY-018
title: Heuristic difficulty tuner (time + hints + errors → next difficulty)
type: story
status: backlog
priority: P0
estimate: S
parent: EPIC-007
phase: mvp
tags: [adaptive, difficulty, heuristic]
created: 2026-04-25
updated: 2026-04-25
---

## Description

The simplest possible adaptive engine for MVP. After each episode, compute a single "difficulty signal" `s ∈ [-1, +1]`:

```
s = -0.5 * normalized_overtime
    -0.3 * normalized_hint_usage
    -0.2 * normalized_failed_attempts
    + small_correctness_bonus
```

If `s > 0.3`, next problem is one rung harder. If `s < -0.3`, one rung easier. Otherwise, same difficulty. Per-concept skill score is updated with a Bayesian-flavored EMA.

This is **explicitly heuristic, not learned.** A learned model is v2 work — and only justified once we have enough episodes to fit one. Heuristics are interpretable, debuggable, and good enough until proven otherwise.

## Acceptance criteria

- [ ] Function `nextDifficulty(currentLevel, episode)` lives in `packages/profile/src/difficulty.ts`.
- [ ] Function `updateSkillScore(prev, episode)` lives in same file.
- [ ] Unit tests: 6 representative scenarios (perfect solve / hint-heavy / repeated failures / overtime / under-time / no-progress) all produce expected next-difficulty.
- [ ] No floating-point coefficients hardcoded inline — all in a tunable config object.

## Dependencies

- Blocked by: STORY-013 (skill_scores + episodes tables).

## Tasks

(To be created when work begins.)

## Activity log

- 2026-04-25 — created
