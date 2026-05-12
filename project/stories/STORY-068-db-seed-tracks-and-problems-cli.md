---
id: STORY-068
title: Ship db:seed:tracks and db:seed:problems CLIs (fresh self-host gets no real content)
type: story
status: backlog
priority: P0
estimate: S
parent: EPIC-019
phase: v1
tags: [bug, seed, self-host, dev-experience]
created: 2026-05-11
updated: 2026-05-11
---

## Description

A fresh `pnpm --filter @learnpro/db db:migrate && db:seed && db:seed:concepts` cycle leaves the DB with:

- 206 concepts + 428 prerequisite edges (✓ from `db:seed:concepts`).
- 1 demo track (`python-arrays-101`) + 1 demo episode for a single demo user (✓ from `db:seed`).
- **Zero real tracks** (`python-fundamentals`, `typescript-fundamentals`) — the YAMLs in `packages/tracks/*.yaml` are never imported into the DB.
- **Zero real problems** — the 33 Python + 30 TypeScript YAMLs in `packages/problems/yaml/` are never imported.

`seedTrack` and `seedProblems` exist as exported functions in `@learnpro/tracks` and `@learnpro/problems`, but they're only called from Vitest integration tests. There's no production bin script + npm script wiring them.

Result: any fresh self-host setup lands the user in an empty app — onboarding completes, but `/api/recommendation` returns `recommended_tracks: []`, `/api/tutor/start` has no problems to assign, and the entire learner loop is unreachable.

Caught during the 2026-05-11 Chrome walkthrough.

## Acceptance criteria

- [ ] New `packages/db/bin/seed-tracks.ts`: loads both track YAMLs via `@learnpro/tracks` and calls `seedTrack` against the DB. Idempotent on re-run.
- [ ] New `packages/db/bin/seed-problems.ts`: loads all problems via `@learnpro/problems::loadProblems()` and calls `seedProblems`. Idempotent on re-run.
- [ ] Add `"db:seed:tracks": "tsx bin/seed-tracks.ts"` and `"db:seed:problems": "tsx bin/seed-problems.ts"` to `packages/db/package.json` scripts.
- [ ] Add `@learnpro/tracks` and `@learnpro/problems` as `workspace:*` dependencies of `@learnpro/db` if not already present. Mind the workspace dep cycle rules from the 2026-05-11 DECISIONS_LOG entry — `@learnpro/db` is upstream of both packages today, so adding back-edges would cycle. Probably the bin scripts belong in a NEW package or in `@learnpro/tracks`/`@learnpro/problems` instead.
- [ ] Add an `npm-run-all` style aggregated `db:bootstrap` script in the root package.json that runs migrate → seed → seed:concepts → seed:tracks → seed:problems in order. Document it in the self-host README.
- [ ] Vitest integration test that runs the full bootstrap chain against a transient Docker Postgres and asserts every expected row count is non-zero.
- [ ] Self-host README updated with the single-command bootstrap recipe.

## Dependencies

None. Pure additive work — existing seed scripts unchanged.

## Notes

The "bin scripts in `@learnpro/db` import `@learnpro/tracks`" approach creates a workspace dep cycle (because `@learnpro/tracks` already depends on `@learnpro/db`). Three options:
1. **Put the bin scripts in `@learnpro/tracks`** and `@learnpro/problems` themselves. Pro: no cycle. Con: split bootstrap UX across packages.
2. **Create a `@learnpro/bootstrap` package** that depends on all three (db, tracks, problems). Pro: clean. Con: new package overhead.
3. **Inline the seed logic** in `@learnpro/db/bin/` and don't import `@learnpro/tracks` — parse the YAMLs directly. Pro: no cycle, no new package. Con: duplicates parsing logic; drifts from `@learnpro/tracks` schema validation.

Pick (1) for v1 — least new infrastructure. `pnpm --filter @learnpro/tracks db:seed:tracks` matches the existing `pnpm --filter @learnpro/db db:seed:concepts` pattern.

## Activity log

- 2026-05-11 — created. Found during /option 1/ Chrome walkthrough.
