---
id: STORY-053
title: Conversational onboarding agent (replaces structured form portion of STORY-005)
type: story
status: done
priority: P0
estimate: L
parent: EPIC-004
phase: mvp
tags: [tutor-agent, onboarding, conversational, novel]
created: 2026-04-25
updated: 2026-04-28
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

- [x] First-login user sees the conversational onboarding (instead of a form). `apps/web/src/app/onboarding/page.tsx` (server component, `auth()` redirect to `/auth/signin` if no session) renders `<OnboardingClient />` (client component) with assistant/user message bubbles, a text input + Send button, and a visible "Step N / 6" indicator. The Auth.js `events.signIn` profile-shell bootstrap unchanged from STORY-005; `destinationFor()` already routes new users to `/onboarding`.
- [x] At least 3 of the 5 original profile fields can be derived from a typical 4–6 message exchange. The warm-coach `ONBOARDING_SYSTEM_PROMPT` (`packages/prompts/src/onboarding.ts`) instructs Haiku to drill-down on prior answers and emit `{ assistant_message, captured, done }` JSON per turn so the API can structurally extract field updates. `MAX_ONBOARDING_TURNS = 6` cap leaves room for greeting + 5 follow-ups; the deterministic-fallback path covers target_role / time_budget_min / primary_goal in 3 turns end-to-end.
- [x] User can type "skip" / "later" / "I'd rather start now" at any point and be routed to the dashboard. The system prompt instructs the agent to set `done=true` on those phrases. The deterministic fallback recognises 12 phrases (`skip`, `later`, `I'd rather`, `start now`, `let's go`, `I'll do this later`, etc.) and exits gracefully even at turn 1. The UI renders a "Start now (skip)" link that POSTs the canonical `"I'd rather start now."` message; on `done=true` the client routes to `/dashboard` after a 1.2s delay so the close-out is visible.
- [x] Whatever profile fields were captured (even just one) persist correctly. New `updateProfileFields()` in `@learnpro/db` does a partial UPSERT — only the supplied non-null columns are written, never clobbering a previously-captured value. The API endpoint calls the injectable `OnboardingProfileWriter` per turn whenever `captured` has any keys; `defaultsFromEnv()` in `apps/api/src/index.ts` auto-wires the writer to `updateProfileFields()` whenever `DATABASE_URL` is set. Writer failures are logged + swallowed so a transient DB blip never blocks the user-facing turn.
- [x] Token-budget guard: onboarding capped at N tokens; if exceeded, gracefully exits with what was captured. Two caps in `@learnpro/shared`: `MAX_ONBOARDING_TURNS = 6` (assistant turns) and `MAX_ONBOARDING_TOKENS = 3000` (running ~4-chars-per-token estimate across the conversation). Either trip → `done=true` close-out without invoking the LLM. The existing `BudgetGatedLLMProvider` per-user daily limit still applies; `TokenBudgetExceededError` is mapped to a 429 by the global error handler.
- [x] If the LLM provider is unavailable, fallback to a minimal structured form (degrades gracefully, never blocks sign-in). `LEARNPRO_DISABLE_ONBOARDING_LLM=1` switches the API endpoint to a deterministic 3-question state machine (target_role → time_budget_min → primary_goal → close-out) that captures fields per turn without ever calling the LLM. Live LLM transport failures (ECONNRESET, etc.) surface a 503 `onboarding_unavailable` rather than 500, and the UI offers a friendly retry/skip banner. AC verified by 2 dedicated tests (`fallback-deterministic path` + `LLM transport failure`).

## Files changed

- New: `packages/shared/src/onboarding.ts` (Zod schemas + cap constants), `packages/shared/src/onboarding.test.ts` (17 tests).
- New: `packages/db/src/profile-update.ts` (partial UPSERT helper), `packages/db/src/profile-update.test.ts` (6 integration tests, gated on `DATABASE_URL`).
- New: `packages/prompts/src/onboarding.ts` (`ONBOARDING_SYSTEM_PROMPT` + `PROMPT_VERSION = "onboarding-2026-04-28"`), `packages/prompts/src/onboarding.test.ts` (5 prompt-shape tests).
- New: `apps/api/src/onboarding.ts` (Fastify handler + deterministic fallback + token-counter helper), `apps/api/src/onboarding.test.ts` (20 tests).
- New: `apps/web/src/app/onboarding/OnboardingClient.tsx` (client component), `apps/web/src/lib/onboarding-state.ts` (pure state-machine helpers), `apps/web/src/lib/onboarding-state.test.ts` (8 tests).
- New: `apps/web/src/app/api/onboarding/turn/route.ts` (Next.js proxy), `apps/web/src/app/api/onboarding/turn/route.test.ts` (8 tests).
- Modified: `apps/web/src/app/onboarding/page.tsx` (replaces STORY-005 placeholder), `apps/api/src/index.ts` (registers route + `defaultsFromEnv()` wiring), `packages/db/src/index.ts` + `packages/shared/src/index.ts` + `packages/prompts/src/index.ts` (re-exports), `apps/api/package.json` (adds `@learnpro/prompts`).

## Test count

64 new tests across the 5 test files. Total repo: **322 passed / 27 skipped** (skips are integration tests gated on `DATABASE_URL` or `LEARNPRO_REQUIRE_PISTON=1`). All gates green: typecheck / lint / test / format / next build.

## Dependencies

- Blocked by: [STORY-005](./STORY-005-auth-and-onboarding.md) (auth + bootstrap profile shell), STORY-009 (LLM gateway), STORY-013 (profile schema), [STORY-057](./STORY-057-policy-adapter-interfaces.md) (`AutonomyPolicy` interface so the agent uses `AlwaysConfirm` baseline mode initially), and [ADR-0006](../../docs/architecture/ADR-0006-agentic-orchestration.md) (orchestration pattern).
- Blocks: STORY-021 (career-aware onboarding interview — that Story extends this one).

## Notes

- Honest prior-art check: ChatGPT-as-tutor exists for *learning*, but conversational onboarding *into* a learning platform with drill-down + graceful exit isn't standard. Duolingo / Brilliant.org / Khan Academy all use forms or no onboarding. Worth flagging in [`NOVEL_IDEAS.md`](../../docs/vision/NOVEL_IDEAS.md).
- The fallback-to-form requirement is critical: onboarding can never block sign-in.

## Activity log

- 2026-04-25 — created (Path A scope confirmation)
- 2026-04-28 — picked up; built end-to-end on `story/053-conversational-onboarding`
- 2026-04-28 — done. 64 new tests; 322 passing / 27 skipped repo-wide; all gates green; web build clean.
