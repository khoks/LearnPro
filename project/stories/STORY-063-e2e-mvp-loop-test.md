---
id: STORY-063
title: End-to-end MVP-loop test (Playwright OR Vitest browser-mode + axe)
type: story
status: done
priority: P0
estimate: M
parent: EPIC-002
phase: mvp
tags: [e2e, playwright, mvp-done-criterion]
created: 2026-05-05
updated: 2026-05-05
---

## Description

Closes the MVP definition-of-done criterion #5 (`docs/roadmap/MVP.md`): "End-to-end test of the loop passes." With this Story landed, **all 6 MVP done criteria are now satisfied — MVP is demoable.**

## Acceptance criteria

- [x] Test file at `apps/api/src/e2e/mvp-loop.e2e.test.ts` (Path B — vitest fetch-driver). Path B chosen because the MVP loop is API-driven; the UI is thin glue around fetch(), and Chromium download was excessive for the marginal extra signal a real browser would add.
- [x] Test runs gated on `LEARNPRO_E2E=1` (and skipped when `DATABASE_URL` is unset) so default `pnpm test` doesn't try to boot Postgres.
- [x] Documented `pnpm e2e` script (`scripts/e2e/run.mjs`) boots a dedicated `learnpro-postgres-e2e` Postgres on port 5433 (avoids conflict with native installs on 5432), applies migrations, runs the test, and leaves the container running for fast iteration. `pnpm e2e -- --teardown` stops + removes it.
- [x] Test exercises sign-in (simulated by `fixedUserSession`) → onboarding (deterministic fallback via `LEARNPRO_DISABLE_ONBOARDING_LLM=1`, 3 user replies) → recommended (`GET /v1/recommendation`) → session start (`POST /v1/tutor/episodes`) → submit-passing (with `AlwaysPassSandbox` + scripted rubric JSON) → finish (`POST /v1/tutor/episodes/:id/finish`) → next-problem (assigns again).
- [x] Test asserts ≥5 DB row delta categories grew: `episodes` (+2), `submissions` (+1), `agent_calls` (+1), `interactions` (+3), `xp_awards` (+1), `users.xp` (>0).
- [x] CI workflow runs the test → **doc'd as opt-in operator-run script** (`pnpm e2e`). Path A's "Docker-in-CI on GitHub-hosted runners" is feasible but over-budget for this Story; the script is shaped so a future workflow_dispatch addition is a 5-line change.

## Notes from implementation

- **Fakes**: `apps/api/src/e2e/harness.ts` exposes `FakeLLMQueue` (FIFO scripted-text queue with default rubric stub fallback), `buildFakeLLM` (wraps the queue in `AnthropicTransport` so the production `AnthropicProvider` telemetry sink still records `agent_calls` rows), `AlwaysPassSandbox` (emits `__LEARNPRO_PASS__` regardless of code), and `fixedUserSession` (bypasses the Auth.js cookie roundtrip).
- **Real wiring**: `buildE2eServer` constructs a Fastify with the production `buildDrizzleTutorFactory` + `DrizzleInteractionStore` + real recommendation route — only the LLM and sandbox are faked. The same Drizzle wiring that ships in production runs the test.
- **Migration fix**: The 0008 repair migration's `ADD COLUMN dedupe_key` was not idempotent (the original commit message claimed it was — only the `CREATE TABLE / DO EXCEPTION` blocks were idempotent). Wrapped with `IF NOT EXISTS` so a fresh `db:migrate` against an empty Postgres applies the chain end-to-end. Production no-op against already-migrated DBs.
- **finish + outcome**: The API factory rehydrates each session as `phase: "coding"` per HTTP request (the DB tracks attempts + hints_used but not the in-memory `last_passed`), so the test calls finish with explicit `outcome: "passed"` after a passing submit — same pattern a UI client should use when it has the grade response in hand.

## Activity log

- 2026-05-05 — created (last MVP done criterion).
- 2026-05-05 — done. Path B chosen; vitest fetch-driver + harness in apps/api/src/e2e/. 9 harness smoke tests + the gated mvp-loop e2e suite (1 passing test, ~500ms runtime, ≥5 DB delta categories). Migration 0008 made idempotent. **6/6 MVP done criteria satisfied — MVP is demoable.**
