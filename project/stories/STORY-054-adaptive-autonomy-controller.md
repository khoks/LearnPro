---
id: STORY-054
title: Adaptive autonomy controller (tutor decides when to ask vs. act)
type: story
status: done
priority: P1
estimate: M
parent: EPIC-004
phase: mvp
tags: [tutor-agent, autonomy, policy, novel]
created: 2026-04-25
updated: 2026-05-01
---

## Description

Implement the runtime behavior of `AutonomyPolicy` (interface defined in [STORY-057](./STORY-057-policy-adapter-interfaces.md)) that lets the tutor decide, per action, whether to:

1. **Just execute** (high confidence in this user)
2. **Ask for confirmation first**
3. **Ask for free-form input**

Decision is based on a per-user **confidence signal** computed from: agreement rate (how often user accepts tutor's recommended next action), engagement (sessions / week, time-on-task), and outcome success (problems solved without struggle).

Implements **Q1C** from the MVP scope discussion. NOVEL_IDEAS candidate (#2 in the 2026-04-25 batch).

## Scope

- Per-user confidence signal: rolling EWMA over (agreement rate, engagement signal, success signal) — schema fields on `profiles`.
- Threshold-driven autonomy bands:
  - **Low** (< 0.3): always confirm.
  - **Medium** (0.3 – 0.7): confirm consequential actions; execute trivial.
  - **High** (> 0.7): execute most things; confirm only the disruptive (e.g., switching tracks).
- Telemetry: every autonomy decision logged with the inputs and the chosen band, so we can audit and tune (lands as event type `autonomy_decision` in [STORY-055](./STORY-055-rich-interaction-telemetry-schema.md)'s `interactions` table).
- Default deterministic implementation: `EwmaBandedAutonomyPolicy` (the spec above).
- The GenAI policy implementation (uses LLM to decide per-action) lands in v1 once we have user-data baseline.

## Acceptance criteria

- [x] Confidence signal updates after each user accept / reject / abandon. (`updateConfidenceSignal` pure helper + `refreshConfidenceSignal` dep on `UpdateProfileDeps` + Drizzle adapter writing `confidence_signal` jsonb.)
- [x] Switching between bands changes observed tutor behavior (smoke test: simulate 20 high-agreement actions, observe band shift). (`replay-002-autonomy.json` 20-step transcript covers Low → Medium → High.)
- [x] Autonomy decisions persist to `interactions` table. (`onDecision` hook on `EwmaBandedAutonomyPolicy` writes via the `autonomy_decision` event type from STORY-055.)
- [x] Default policy wired into the tutor agent and used on every action that has a "should I just do this?" branch. (`TutorSession.consultAutonomy(kind)` covers `assign-next-problem` / `proactive-hint` / `auto-set-final-outcome` / `switch-track`.)
- [x] Cold-start safety: brand-new users get `Low` band until ≥ 5 episodes of signal exist. (`cold_start_episodes: 5` config + null-signal short-circuit; covered by 2 dedicated tests.)

## Dependencies

- Blocked by: [STORY-057](./STORY-057-policy-adapter-interfaces.md) (interface), [STORY-055](./STORY-055-rich-interaction-telemetry-schema.md) (telemetry), STORY-013 (profile to store confidence signal).
- Blocks: nothing critical; the tutor functions on `AlwaysConfirm` baseline (from STORY-057) without this Story landing.

## Notes

- Honest prior-art check: agentic frameworks generally don't ground autonomy on accumulated user signal. Recommendation systems sometimes "fade out" confirmation prompts after compliance, but not as an explicit policy at the agent level. Worth flagging in [`NOVEL_IDEAS.md`](../../docs/vision/NOVEL_IDEAS.md).

## Activity log

- 2026-04-25 — created (Path A scope confirmation)
- 2026-05-01 — picked up
- 2026-05-01 — done. Schema: `profiles.confidence_signal jsonb` (migration `0010_autonomy_signal.sql`). Pure policy: `EwmaBandedAutonomyPolicy` in `@learnpro/scoring` (Low <0.3 / Medium 0.3-0.7 / High >0.7) with cold-start safety pinning users to Low for the first 5 episodes; `updateConfidenceSignal` EWMA helper. DB: `getConfidenceSignal` / `updateConfidenceSignalRow` / `countClosedEpisodes` helpers in `@learnpro/db`; partial UPSERT pattern. Tutor: `UpdateProfileDeps.refreshConfidenceSignal` (Drizzle adapter fans out engagement + outcome EWMAs); `TutorSession.consultAutonomy(kind)` covers the four well-known action kinds. Telemetry: `onDecision` hook on the policy emits `autonomy_decision` events through STORY-055's `interactions` schema (extended with optional `band` field, backwards-compatible). Replay: `replay-002-autonomy.json` 20-step Low → Medium → High transcript. API: `GET /v1/autonomy/state` + Next.js proxy. UI: `<AutonomyBandIndicator>` on `/dashboard` with coach-voice tooltip; forbidden-phrase test. ~60 new tests; 144 scoring / 92 agent / 78 db / 139 api / 313 web all green.
