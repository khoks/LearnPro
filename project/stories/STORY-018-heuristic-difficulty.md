---
id: STORY-018
title: Heuristic difficulty tuner (time + hints + errors → next difficulty)
type: story
status: done
priority: P0
estimate: S
parent: EPIC-007
phase: mvp
tags: [adaptive, difficulty, heuristic]
created: 2026-04-25
updated: 2026-04-26
---

## Description

The simplest possible adaptive engine for MVP. After each episode, compute a single "difficulty signal" `s ∈ [-1, +1]`:

```
s = -0.5 * normalized_overtime
    -0.3 * normalized_hint_usage
    -0.2 * normalized_failed_attempts
    + small_correctness_bonus
```

If `s ≥ 0.3`, next problem is one rung harder. If `s ≤ -0.3`, one rung easier. Otherwise, same difficulty. Per-concept skill score is updated with a Bayesian-flavored EMA.

This is **explicitly heuristic, not learned.** A learned model is v2 work — and only justified once we have enough episodes to fit one. Heuristics are interpretable, debuggable, and good enough until proven otherwise.

## Acceptance criteria

- [x] Function `nextDifficulty(currentLevel, episode)` lives in `packages/scoring/src/difficulty.ts`. (Home moved from the spec'd `packages/profile/src/difficulty.ts` because no `profile` package exists; `scoring` is its sibling and already houses `policies/difficulty-policy.ts` for catalog-level multi-episode tier picks. The new helpers are the per-episode complement.)
- [x] Function `updateSkillScore(prev, episode)` lives in same file. Bayesian-flavored EWMA: `skill = α * episode_score + (1-α) * prev.skill`; `confidence` grows asymptotically toward `confidence_max`.
- [x] Unit tests: 6+ representative scenarios — perfect solve (easy → medium), hint-heavy (no step), repeated failures (hard → medium), massive overtime (medium → easy), under-time at expert (capped), no-progress at easy (capped), plus operator-injected stricter threshold. 20 tests total in `difficulty.test.ts`, all green.
- [x] No floating-point coefficients hardcoded inline — all in a tunable Zod-schema'd config object (`DifficultyHeuristicConfigSchema`) with sensible defaults exposed as `DEFAULT_DIFFICULTY_HEURISTIC`. Operators can pass a partial override per call.

## Dependencies

- Blocked by: STORY-013 (skill_scores + episodes tables) — note: STORY-013 not yet started; the helpers operate on plain typed records (`ConceptSkill` from `packages/scoring/src/policies/types.ts`) so they can be wired up to the persistence layer the moment STORY-013 lands. No DB code in this Story.

## Tasks

(Tracked inline in the activity log.)

## Activity log

- 2026-04-25 — created
- 2026-04-26 — picked up. Built per-episode `difficultySignal()` (clamped overtime/hints/failures + correctness bonus), `nextDifficulty()` (inclusive `≥` / `≤` thresholds so the default `correctness_bonus = step_up_threshold = 0.3` boundary case actually steps up), `episodeSuccessScore()` (penalties sum naturally and `Math.max(0, …)` floors to zero), and `updateSkillScore()` (EWMA on skill + asymptotic confidence growth). Config is a Zod schema with defaults; callers can pass partial overrides. Total: 20 new tests, all green; full sweep (`pnpm format` / `lint` / `typecheck` / `test`) passes — 12 tasks, no errors.
