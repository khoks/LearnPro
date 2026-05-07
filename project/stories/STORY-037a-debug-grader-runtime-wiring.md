---
id: STORY-037a
title: Debug-grader runtime wiring + bug_finding_scores persistence (STORY-037 follow-up)
type: story
status: backlog
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

- [ ] New migration adds a `bug_finding_scores` table parallel to `skill_scores`: `(user_id, archetype)` unique pair, `score`/`confidence`/`attempts`, FK on `users.id`. Idempotent UPSERT.
- [ ] When `episode.problem.kind === "debug"`, the apps/api grade-deps adapter calls a debug-grader (via `buildDebugGradeSystemPrompt` + `buildDebugGradeUserPrompt`) AFTER the existing `gradeAgent`. Best-effort: a parse failure falls through to `named_bug = false`.
- [ ] `updateProfile` reads the `kind` + `bug_archetype` from the episode/problem and writes one `bug_finding_scores` row per close (UPSERT). Same `got_help` short-circuit applies.
- [ ] At least 5 new tests covering: debug-only path runs the prompt; implement-only path skips it; got_help short-circuit; cold-start row insert; subsequent close moves the EWMA.

## Dependencies

- Blocked by: STORY-037 (schema + prompt + policy already landed).

## Notes

This was carved out of STORY-037 to keep the PR reviewable. The hard parts (schema discriminator, archetype enum, seed bank, scoring policy, prompt) are already in main. This follow-up is mostly adapter wiring + a migration.

## Activity log

- 2026-05-06 — created (carved out of STORY-037)
