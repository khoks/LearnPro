---
id: STORY-070
title: Add deterministic fallback for today-plan generation when ANTHROPIC_API_KEY is unset
type: story
status: backlog
priority: P1
estimate: S
parent: EPIC-015
phase: v1
tags: [bug, today-plan, self-host, fallback]
created: 2026-05-12
updated: 2026-05-12
---

## Description

`packages/agent/src/tools/plan-session.ts` calls `LLMRouter.complete` → Anthropic without checking for the no-API-key fallback path. When `ANTHROPIC_API_KEY` is unset (the self-hosted no-LLM default), every request to `POST /v1/session-plan` and the dashboard's `GET /v1/today-plan` surfaces a 503 with `LLMRequestError: ANTHROPIC_API_KEY is not set`. The UI degrades gracefully ("Couldn't generate today's plan. [Retry]") so it's not a hard crash, but it means the entire planning surface is unreachable for self-hosters without an API key.

Parallels: STORY-053 (onboarding) shipped a deterministic 3-question state-machine fallback for exactly this case (`LEARNPRO_DISABLE_ONBOARDING_LLM=1`). Today-plan and weekly-plan should both have analogous fallbacks.

Caught during the 2026-05-12 Chrome walkthrough (round 2).

## Acceptance criteria

- [ ] `plan-session.ts`'s `run()` returns a deterministic fallback plan when the LLM throws (or when `LEARNPRO_DISABLE_PLAN_LLM=1`):
  - 3-5 items pulled from the user's track's next-due concepts (via `getDueConcepts` already used by the dashboard).
  - One review item if `due_reviews.length > 0`.
  - `fallback: true` flag set on the response so the UI can show a "deterministic plan — wire your API key for the LLM version" coach-voice note.
- [ ] `weekly-plan.ts` gets the same treatment (matching the per-day deterministic-name behavior STORY-046b already shipped).
- [ ] Test: `pnpm --filter @learnpro/agent test plan-session` with the LLM stubbed to throw — assert deterministic items returned, `fallback: true`.
- [ ] Manual verification: with `ANTHROPIC_API_KEY` unset, the dashboard renders a plan card with real items (not "Couldn't generate today's plan").
- [ ] No forbidden-phrase regressions on the new copy.

## Dependencies

None. Pure additive.

## Notes

The exact "fallback plan" logic is mostly already in `today-plan.ts::buildTodayPlan` — it walks `due_reviews`, `due_concepts`, and `recent_episodes` deterministically. The plan-session agent just needs to delegate to that helper when the LLM is unavailable instead of throwing.

## Activity log

- 2026-05-12 — created. Found during Chrome walkthrough round 2. Stack: `LLMRequestError: ANTHROPIC_API_KEY is not set` at `plan-session.ts:63` → 503 from `POST /v1/session-plan` → red "Couldn't generate today's plan" card.
