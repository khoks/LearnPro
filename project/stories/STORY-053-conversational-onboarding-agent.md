---
id: STORY-053
title: Conversational onboarding agent (replaces structured form portion of STORY-005)
type: story
status: backlog
priority: P0
estimate: L
parent: EPIC-004
phase: mvp
tags: [tutor-agent, onboarding, conversational, novel]
created: 2026-04-25
updated: 2026-04-25
---

## Description

Replace the originally-scoped 5-question structured form (STORY-005) with a **conversational onboarding agent** that has a candid chat with the new user, presents consequential questions upfront, drills into specifics based on user responses, and gracefully ends the questionnaire if the user defers further clarification.

Implements **Q1B** from the MVP scope discussion. NOVEL_IDEAS candidate (#1 in the 2026-04-25 batch).

## Scope

- Tutor agent invoked at first login from STORY-005 hand-off.
- Workflow loaded via the agentic-orchestration policy doc (per [ADR-0006](../../docs/architecture/ADR-0006-agentic-orchestration.md)).
- Initial consequential questions (subset of original 5): target role, time budget, primary goal.
- Drill-down logic: based on each answer, decide what to ask next or whether to skip ahead.
- Graceful exit: if the user types something like "I'd rather start", "later", or just stops engaging for ~60s, the agent acknowledges and routes to the dashboard with whatever profile fields it has captured so far.
- Profile write: every answer is persisted incrementally (not at end-of-flow) so a partial onboarding still seeds the profile.
- Output: structured profile fields (same shape as the originally-planned form output) to keep STORY-013 schema unchanged.

## Out of scope

- Voice (defer to v1 with EPIC-008).
- Adaptive tone within onboarding (initial version uses warm-coach baseline; adaptive tone lands with [STORY-057](./STORY-057-policy-adapter-interfaces.md)'s `TonePolicy`).
- Re-running onboarding later (initial version is one-shot at first login).

## Acceptance criteria

- [ ] First-login user sees the conversational onboarding (instead of a form).
- [ ] At least 3 of the 5 original profile fields can be derived from a typical 4–6 message exchange.
- [ ] User can type "skip" / "later" / "I'd rather start now" at any point and be routed to the dashboard.
- [ ] Whatever profile fields were captured (even just one) persist correctly.
- [ ] Token-budget guard: onboarding capped at N tokens; if exceeded, gracefully exits with what was captured.
- [ ] If the LLM provider is unavailable, fallback to a minimal structured form (degrades gracefully, never blocks sign-in).

## Dependencies

- Blocked by: [STORY-005](./STORY-005-auth-and-onboarding.md) (auth + bootstrap profile shell), STORY-009 (LLM gateway), STORY-013 (profile schema), [STORY-057](./STORY-057-policy-adapter-interfaces.md) (`AutonomyPolicy` interface so the agent uses `AlwaysConfirm` baseline mode initially), and [ADR-0006](../../docs/architecture/ADR-0006-agentic-orchestration.md) (orchestration pattern).
- Blocks: STORY-021 (career-aware onboarding interview — that Story extends this one).

## Notes

- Honest prior-art check: ChatGPT-as-tutor exists for *learning*, but conversational onboarding *into* a learning platform with drill-down + graceful exit isn't standard. Duolingo / Brilliant.org / Khan Academy all use forms or no onboarding. Worth flagging in [`NOVEL_IDEAS.md`](../../docs/vision/NOVEL_IDEAS.md).
- The fallback-to-form requirement is critical: onboarding can never block sign-in.

## Activity log

- 2026-04-25 — created (Path A scope confirmation)
