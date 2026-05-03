---
id: STORY-011
title: Tutor agent with assign-problem / give-hint / grade / update-profile tools
type: story
status: done
priority: P0
estimate: L
parent: EPIC-004
phase: mvp
tags: [agent, tutor, tools, anthropic]
created: 2026-04-25
updated: 2026-05-01
---

## Description

The brain of the MVP. A hand-rolled agent harness (no LangChain — see [ADR-0003](../../docs/architecture/ADR-0003-llm-provider.md)) that drives the tutor loop:

1. **`assign_problem`** — given the learner's profile + current track, pick the next problem from the seed bank (STORY-016) at the heuristic-tuned difficulty (STORY-018).
2. **`give_hint`** — return a hint at the requested rung (1=conceptual, 2=approach, 3=near-solution). Each hint costs XP. Hint history is logged so future tuning can use it.
3. **`grade`** — given the user's submission and the problem's hidden tests, run via the sandbox (STORY-007/008), then produce a structured rubric (correctness, idiomatic-ness, edge-case coverage) plus a short prose explanation.
4. **`update_profile`** — write an episode row (problem id, attempt count, hints used, final outcome, time-to-solve) and update the per-concept skill score using a simple Bayesian-ish formula (full version of the schema in STORY-013).

The agent loop is a state machine, not a free-form ReAct loop — predictable, auditable, cheap. Every tool call is logged with input/output/cost/latency (STORY-012).

## Acceptance criteria

- [x] Agent harness lives in `packages/agent/` (one workspace package, hand-rolled `TutorSession` state-machine driver in `src/tutor-session.ts`, no LangChain — per ADR-0003).
- [x] Each of the 4 tools has a Zod schema, a handler, and unit tests. Tools live in `packages/agent/src/tools/{assign-problem,give-hint,grade,update-profile}.ts`. Test counts (vitest): assignProblem 12, giveHint 6, grade 9, updateProfile 11.
- [x] State machine transitions enforced via `IllegalTransitionError`: `idle → assigned → coding → (hint | submit) → grading → coding (on fail) | grading (on pass) → finish → done` (and `* → abandoned`). 11 `tutor-session.test.ts` tests cover happy paths + every illegal move.
- [x] Every LLM-touching tool writes a row to `agent_calls` via `DrizzleLLMTelemetrySink` from STORY-060. The integration test (`packages/agent/src/integration.test.ts`, DATABASE_URL-gated) asserts `prompt_version: "tutor-2026-05-03"` rows land for the rubric + hint calls. `updateProfile` is deterministic (no LLM call) — its DB writes go directly to `episodes` + `skill_scores`.
- [x] Eval-harness fixture + deterministic replay: `packages/agent/test/fixtures/replay-001.json` records a 6-step transcript (assign → fail → rung-1 hint → fail → rung-2 hint → pass → finish). `packages/agent/src/replay.test.ts` (2 tests) loads it, plays it through `TutorSession` with canned tool outputs, asserts the final state matches and the `updateProfile` call sees the live submit_count/hints_used.

Total agent test count: **51 passing + 2 DATABASE_URL-skipped** across **7 files** (assign-problem, give-hint, grade, update-profile, tutor-session, replay, integration). API route test count: **18 new** in `apps/api/src/tutor.test.ts` (4 routes × 401/400/404/409/happy-path coverage).

## Architecture notes

- **Ports pattern**: each tool depends on a narrow `*Deps` port (`AssignProblemDeps`, `GiveHintDeps`, `GradeDeps`, `UpdateProfileDeps`) so tests inject fakes without mocking Drizzle / Anthropic / sandbox transports. Drizzle/LLM/Sandbox-backed dep builders live in `packages/agent/src/drizzle-deps.ts`, shared between the integration test and `apps/api/src/tutor-factory.ts`.
- **Hint XP costs** (from STORY-017 spec): rung 1 = 5, rung 2 = 15, rung 3 = 30. Returned on every `give_hint` response. Wallet enforcement deferred to STORY-022.
- **Rubric**: `{ correctness, idiomatic, edge_case_coverage }` each in [0, 1] + a 1-2 sentence prose explanation. Anti-praise prompt — never effusive.
- **Difficulty bridge**: `ProblemDef.difficulty` is integer 1-5; the scoring tier ladder is `easy/medium/hard/expert`. `difficultyToTier()` in `state.ts` maps 1-2→easy, 3→medium, 4→hard, 5→expert.
- **Skill score scaling**: `skill_scores.score` is integer 0-100; `ConceptSkill.skill` is float 0-1. Drizzle dep multiplies/divides by 100 on the boundary.

## Apps/API endpoints (auth-gated via `sessionResolver`)

- `POST /v1/tutor/episodes` body `{ track_id }` → `assignProblem` → 201
- `POST /v1/tutor/episodes/:id/hint` body `{ rung }` → `giveHint`
- `POST /v1/tutor/episodes/:id/submit` body `{ code }` → `grade`
- `POST /v1/tutor/episodes/:id/finish` body `{ outcome?, reveal_clicked? }` → `updateProfile`

Error mapping: `NoEligibleProblemError` / `EpisodeNotFoundError` / `UpdateProfileEpisodeMissingError` → 404; `IllegalTransitionError` → 409; `TokenBudgetExceededError` → 429 (via the global STORY-060 handler).

## Dependencies

- Blocked by: STORY-009 (LLM gateway), STORY-013 (profile schema), STORY-016 (seed bank), STORY-018 (difficulty tuner). All landed before this Story.

## Tasks

(All work tracked through commits on `story/011-tutor-agent`; no per-Task split was needed.)

## Activity log

- 2026-04-25 — created
- 2026-05-01 — picked up
- 2026-05-01 — done (commits: skeleton+assign / hint+grade / updateProfile+state machine / API routes / replay fixture / DB-gated integration test / tracker close-out — see PR for full details)

## Follow-ups filed

- STORY-062 (tutor session UI): the `/session` page is *not* shipped here. The MVP loop is "API works end-to-end + replay test passes"; UI is a separate Story under EPIC-002.
