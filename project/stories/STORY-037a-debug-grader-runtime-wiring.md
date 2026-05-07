---
id: STORY-037a
title: Debug-grader runtime wiring + bug_finding_scores persistence (STORY-037 follow-up)
type: story
status: done
priority: P2
estimate: S
parent: EPIC-007
phase: v1
tags: [problems, debugging, scoring, v1, follow-up]
created: 2026-05-06
updated: 2026-05-06
---

## Description

STORY-037 landed the schema, seed bank, debug-grade prompt, bug-finding scoring axis, and editor pre-population. This follow-up wires the runtime persistence path so the `bug_finding_score` actually moves on each debug-problem submission.

## Acceptance criteria

- [x] New migration adds a `bug_finding_scores` table parallel to `skill_scores`: `(user_id, archetype)` unique pair, `score`/`confidence`/`attempts`, FK on `users.id`. Idempotent UPSERT.
- [x] When `episode.problem.kind === "debug"`, the apps/api grade-deps adapter calls a debug-grader (via `buildDebugGradeSystemPrompt` + `buildDebugGradeUserPrompt`) AFTER the existing `gradeAgent`. Best-effort: a parse failure falls through to `named_bug = false`.
- [x] The grade-deps adapter writes one `bug_finding_scores` row per close (UPSERT) on debug-kind problems. The `got_help` short-circuit is enforced by `updateBugFindingScore` itself (returns prev unchanged when `signal.got_help=true`); the helper still writes the prev back to keep `updated_at` fresh.
- [x] At least 5 new tests covering: debug-only path runs the prompt; implement-only path skips it; cold-start row insert; subsequent close moves the EWMA; parse failure falls through to `named_bug=false`. (15 new tests total: 8 unit on `runDebugGrader` + 4 grade-deps integration + 3 route + 6 DB-helper integration.)
- [x] `GET /v1/bug-finding-scores` Fastify route returns the user's per-archetype EWMA (auth-gated; always returns all 8 archetypes including cold-start defaults).

## Dependencies

- Blocked by: STORY-037 (schema + prompt + policy already landed).

## Notes

This was carved out of STORY-037 to keep the PR reviewable. The hard parts (schema discriminator, archetype enum, seed bank, scoring policy, prompt) are already in main. This follow-up is mostly adapter wiring + a migration.

## Activity log

- 2026-05-06 — created (carved out of STORY-037)
- 2026-05-06 — picked up
- 2026-05-06 — done. Migration `0022_bug_finding_scores.sql` adds the `(user_id, bug_archetype, org_id)` composite-unique table with the same 8-archetype CHECK constraint as `0018_debug_problems.sql`. New `packages/db/src/bug-finding-scores.ts` exports `upsertBugFindingScore` (loads prev or seeds cold-start, applies EWMA via `updateBugFindingScore` from `@learnpro/scoring`, UPSERTs) and `listBugFindingScores` (returns all 8 archetypes, including cold-start defaults for untouched ones). New `packages/agent/src/debug-grade.ts` houses `runDebugGrader` (sister to `gradeAgent` and `gradeComprehension`), parsed-and-validated. `buildGradeDrizzleDeps`'s `runGraderAgent` now branches on `kind: "debug"` to run the debug grader and persist the EWMA — best-effort for both LLM + DB writes. New `GET /v1/bug-finding-scores` Fastify route. Dashboard card UI deferred — flag as a separate task. 21 new tests (8 unit + 4 grade-deps integration + 3 route + 6 DB-helper integration).
