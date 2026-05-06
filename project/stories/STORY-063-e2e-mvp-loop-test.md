---
id: STORY-063
title: End-to-end MVP-loop test (Playwright OR Vitest browser-mode + axe)
type: story
status: in-progress
priority: P0
estimate: M
parent: EPIC-002
phase: mvp
tags: [e2e, playwright, mvp-done-criterion]
created: 2026-05-05
updated: 2026-05-05
---

## Description

Closes the MVP definition-of-done criterion #5 (`docs/roadmap/MVP.md`): "End-to-end Playwright test of the loop passes."

## Acceptance criteria

- [ ] Test file at `apps/web/e2e/mvp-loop.spec.ts` (Playwright) OR `apps/web/src/test/mvp-loop.browser.test.ts` (vitest browser-mode).
- [ ] Test runs gated on `LEARNPRO_E2E=1` so default `pnpm test` doesn't try to boot Docker containers.
- [ ] Documented `pnpm e2e` script that boots Postgres, applies migrations + seed, runs the test, and tears down.
- [ ] Test exercises sign-in → onboarding (deterministic fallback) → recommended → session → submit-passing → finish → next-problem.
- [ ] Test asserts ≥5 DB row deltas (users.xp grew, episodes inserted, submissions inserted, agent_calls inserted, interactions inserted, xp_awards inserted).
- [ ] CI workflow runs the test (or doc'd as opt-in operator-run script if Docker isn't in CI today).

## Activity log

- 2026-05-05 — created (last MVP done criterion).
