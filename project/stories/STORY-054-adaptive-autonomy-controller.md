---
id: STORY-054
title: Adaptive autonomy controller (tutor decides when to ask vs. act)
type: story
status: backlog
priority: P1
estimate: M
parent: EPIC-004
phase: mvp
tags: [tutor-agent, autonomy, policy, novel]
created: 2026-04-25
updated: 2026-04-25
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

- [ ] Confidence signal updates after each user accept / reject / abandon.
- [ ] Switching between bands changes observed tutor behavior (smoke test: simulate 20 high-agreement actions, observe band shift).
- [ ] Autonomy decisions persist to `interactions` table.
- [ ] Default policy wired into the tutor agent and used on every action that has a "should I just do this?" branch.
- [ ] Cold-start safety: brand-new users get `Low` band until ≥ 5 episodes of signal exist.

## Dependencies

- Blocked by: [STORY-057](./STORY-057-policy-adapter-interfaces.md) (interface), [STORY-055](./STORY-055-rich-interaction-telemetry-schema.md) (telemetry), STORY-013 (profile to store confidence signal).
- Blocks: nothing critical; the tutor functions on `AlwaysConfirm` baseline (from STORY-057) without this Story landing.

## Notes

- Honest prior-art check: agentic frameworks generally don't ground autonomy on accumulated user signal. Recommendation systems sometimes "fade out" confirmation prompts after compliance, but not as an explicit policy at the agent level. Worth flagging in [`NOVEL_IDEAS.md`](../../docs/vision/NOVEL_IDEAS.md).

## Activity log

- 2026-04-25 — created (Path A scope confirmation)
