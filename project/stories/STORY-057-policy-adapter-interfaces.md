---
id: STORY-057
title: Policy-adapter interfaces (Scoring, Tone, Difficulty, Autonomy) + deterministic defaults
type: story
status: backlog
priority: P0
estimate: L
parent: EPIC-019
phase: mvp
tags: [foundation, interfaces, policy, adaptive, novel]
created: 2026-04-25
updated: 2026-04-25
---

## Description

Implement the four core policy-adapter interfaces that let MVP run with **deterministic** policies while leaving a clean swap-in path for the **GenAI evolutionary** implementations in v1. This is the architectural backbone of Path A (decision recorded in [`docs/decisions/DECISIONS_LOG.md`](../../docs/decisions/DECISIONS_LOG.md), 2026-04-25 entry).

## Scope

Each interface lives in `packages/scoring` (the package name covers more than just XP scoring). Each has:

- A TypeScript interface
- A deterministic default implementation
- An operator-injectable rules slot (config-driven, hot-reloadable in dev)
- A telemetry hook so policy decisions are auditable in [STORY-055](./STORY-055-rich-interaction-telemetry-schema.md)'s `interactions` table

### `ScoringPolicy`

- **Inputs:** episode summary, user profile, optional rule overrides
- **Output:** `{ xp, mastery_delta, signals[] }`
- **Default impl:** `xp = base × difficulty × correctness × time_bonus` per current UX_DETAILS.md formula
- **v1 impl:** `GenAIScoringPolicy` that uses Claude with profile + history as context (see Q1E)

### `TonePolicy`

- **Inputs:** user profile, recent engagement signal, conversation context
- **Output:** `{ tone: "warm-coach" | "drill-sergeant" | "socratic-strict", style_hints[] }`
- **Default impl:** `WarmCoachConstantPolicy` (returns warm-coach always)
- **v1 impl:** `AdaptiveTonePolicy` that reads engagement and adjusts (see Q1G)

### `DifficultyPolicy`

- **Inputs:** user profile (skill, sharpness, fatigue), recent attempt history, problem catalog
- **Output:** `{ recommended_difficulty, top_3_problems[], rationale }`
- **Default impl:** `EloEwmaPolicy` — per-concept ELO + EWMA over recent attempts
- **v1 impl:** `MultiDimensionalGenAIPolicy` that incorporates IQ-proxy, learning profile, etc. (see Q2A / Q2B)

### `AutonomyPolicy`

- (See [STORY-054](./STORY-054-adaptive-autonomy-controller.md) for full behavioral spec.)
- **Default impl:** `AlwaysConfirmPolicy` (cold-start safe)
- **v1 impl:** GenAI-driven autonomy

## Acceptance criteria

- [ ] All 4 interfaces defined in `packages/scoring/src/policies/`.
- [ ] All 4 deterministic default implementations passing unit tests.
- [ ] DI binding in `apps/api` wires the defaults; binding is config-driven (env var or config file selects implementation).
- [ ] Operator-injectable rules slot working: a rule overrides the default behavior in a smoke test.
- [ ] Telemetry hook fires on every policy decision; events land in `interactions`.
- [ ] Each policy has a documented "why this default" entry in `packages/scoring/POLICIES.md`.

## Out of scope

- Any GenAI implementation (those are v1 Stories).
- The `AutonomyPolicy` runtime behavior — that's [STORY-054](./STORY-054-adaptive-autonomy-controller.md). This Story just defines the interface and ships `AlwaysConfirmPolicy`.
- UI surfaces for tuning operator rules — config-file-driven is enough for MVP.

## Dependencies

- Blocked by: [STORY-052](./STORY-052-monorepo-skeleton.md) (skeleton — packages must exist).
- Blocks: STORY-018 (heuristic difficulty tuner — uses `DifficultyPolicy`); STORY-022 (XP / streak — uses `ScoringPolicy`); [STORY-054](./STORY-054-adaptive-autonomy-controller.md) (uses `AutonomyPolicy`); tutor agent in STORY-011 (uses `TonePolicy`).

## Notes

- The pattern itself (interface + deterministic default + GenAI swap-in) is the operationalization of the Path A decision.
- Honest prior-art check on the architectural pattern: this is essentially "strategy pattern + DI" applied to learning. Not novel as architecture. Novelty (if any) is in the *specific policies* and the *GenAI evolutionary* implementations that land in v1.

## Activity log

- 2026-04-25 — created (Path A scope confirmation)
