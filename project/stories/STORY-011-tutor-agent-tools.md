---
id: STORY-011
title: Tutor agent with assign-problem / give-hint / grade / update-profile tools
type: story
status: backlog
priority: P0
estimate: L
parent: EPIC-004
phase: mvp
tags: [agent, tutor, tools, anthropic]
created: 2026-04-25
updated: 2026-04-25
---

## Description

The brain of the MVP. A hand-rolled agent harness (no LangChain — see [ADR-0003](../../docs/architecture/ADR-0003-llm-provider.md)) that drives the tutor loop:

1. **`assign_problem`** — given the learner's profile + current track, pick the next problem from the seed bank (STORY-016) at the heuristic-tuned difficulty (STORY-018).
2. **`give_hint`** — return a hint at the requested rung (1=conceptual, 2=approach, 3=near-solution). Each hint costs XP. Hint history is logged so future tuning can use it.
3. **`grade`** — given the user's submission and the problem's hidden tests, run via the sandbox (STORY-007/008), then produce a structured rubric (correctness, idiomatic-ness, edge-case coverage) plus a short prose explanation.
4. **`update_profile`** — write an episode row (problem id, attempt count, hints used, final outcome, time-to-solve) and update the per-concept skill score using a simple Bayesian-ish formula (full version of the schema in STORY-013).

The agent loop is a state machine, not a free-form ReAct loop — predictable, auditable, cheap. Every tool call is logged with input/output/cost/latency (STORY-012).

## Acceptance criteria

- [ ] Agent harness lives in `packages/agent/src/tutor/`.
- [ ] Each of the 4 tools has a Zod schema, a handler, and unit tests.
- [ ] State machine transitions: `assign → coding → (hint | submit) → grading → profile-update → next`.
- [ ] Every tool call writes a row to the agent_calls table (for telemetry + eval).
- [ ] Eval-harness fixture: a recorded transcript replays deterministically.

## Dependencies

- Blocked by: STORY-009 (LLM gateway), STORY-013 (profile schema), STORY-016 (seed bank), STORY-018 (difficulty tuner).

## Tasks

(To be created when work begins.)

## Activity log

- 2026-04-25 — created
