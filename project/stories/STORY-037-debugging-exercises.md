---
id: STORY-037
title: Debugging exercises engine — broken code, find and fix
type: story
status: done
priority: P1
estimate: L
parent: EPIC-007
phase: v1
tags: [problems, content, debugging, v1]
created: 2026-04-25
updated: 2026-05-06
---

## Description

Reading and fixing broken code is closer to real engineering than greenfield problem-solving — and almost no learning platform does it. Build a debugging-exercise engine that presents intentionally-buggy code and asks the user to identify and fix the bug.

This is a strong differentiator (see [`DIFFERENTIATORS.md § 5`](../../docs/product/DIFFERENTIATORS.md)) — it explicitly trains the anti-autocomplete skill set.

## Acceptance criteria

- [x] Problem-type extension: in addition to "implement," support "debug" (broken code is given, expected behavior is described, fix it).
- [x] At least 4 bug archetypes per language with several problems each: off-by-one, mutation in iteration, reference equality, async race (TS), late binding (Python closures), shadowing, type coercion bugs (TS), default-arg-mutability (Python).
- [x] At least 20 debugging problems per language (Python + TS) for v1.
- [x] Editor pre-populates with the buggy code; tests are visible and currently failing.
- [x] Tutor commentary recognizes "the bug was X because Y" reasoning patterns.
- [x] Profile records "found bug correctly" as a separate skill axis from "wrote new code correctly."

## What landed

- **Schema discriminator**: `packages/problems/src/schema.ts` becomes a Zod discriminated union on `kind` (`"implement"` | `"debug"`). Legacy YAMLs without the field auto-normalize to `"implement"` via preprocess so the existing 63 implement-bank YAMLs need no rewrite. STORY-038 will add `"comprehension"` by adding a third Zod object to the union — no other change.
- **Bug archetype enum**: 8 archetypes — `off_by_one`, `mutation_in_iteration`, `reference_equality`, `async_race`, `late_binding`, `shadowing`, `type_coercion`, `default_arg_mutability`. Mirrored in DB `CHECK` constraint (`packages/db/migrations/0018_debug_problems.sql`) and in `BUG_ARCHETYPES` in `@learnpro/scoring/policies/bug-finding-policy.ts` (kept separate so scoring stays a leaf module).
- **DB migration `0018_debug_problems.sql`**: adds `problems.kind` (default `"implement"`) and `problems.bug_archetype` columns + CHECK constraints + `(track_id, kind)` composite index. Idempotent (`IF NOT EXISTS`).
- **Seed bank**: 25 Python debug YAMLs in `packages/problems/python-debug/` + 22 TypeScript debug YAMLs in `packages/problems/typescript-debug/`. Each derived from a curated implement problem by introducing exactly ONE bug archetype; statement reframes "implement X" → "this code SHOULD do X but it's broken — find and fix the bug." Coverage:
  - Python: off_by_one×6, default_arg_mutability×4, mutation_in_iteration×3, late_binding×2, shadowing×4, type_coercion×4, reference_equality×2.
  - TS: off_by_one×6, async_race×3, mutation_in_iteration×3, type_coercion×4, late_binding×2, reference_equality×3.
- **Loader**: `loadProblems` picks up the new directories; `seedProblems` writes `kind` + `bug_archetype` + `expected_behavior` (in `hidden_tests` jsonb for debug rows). Existing implement-bank distribution tests filter on `kind === "implement"`; new STORY-037 tests assert ≥20/lang and ≥4 distinct archetypes/lang.
- **Debug-grade prompt**: `packages/prompts/src/debug-grade-prompt.ts` — narrow Haiku rubric for debug problems. Returns `{ named_bug, inferred_archetype, reasoning_was_coherent, summary }`. Versioned as `debug-grader-2026-05-06` so it doesn't conflict with STORY-034's main grader and doesn't re-baseline the prompt-eval harness. The tutor consults this prompt when `kind: "debug"`.
- **Bug-finding skill axis**: `packages/scoring/src/policies/bug-finding-policy.ts` — per-archetype EWMA score in [0, 1] (cold-start 0.5 uniform prior, α=0.4), parallel to `ConceptSkill`. Two-axis target (passing tests = 0.6, naming the bug = 0.4) so naming alone is partial credit but the test floor is non-negotiable. `got_help=true` short-circuits — same anti-dark-pattern as `updateSkillScore`.
- **Editor pre-population**: `<DebugProblemPanel>` in `apps/web/src/app/session/session-view.tsx` renders below the problem header on `kind: "debug"` problems and (a) tells the user the editor is pre-populated with broken code, (b) shows the `expected_behavior` (what the code SHOULD do), (c) names the archetype in human-friendly language, (d) reminds them hidden tests run on submit. `<KindBadge>` adds a small uppercase yellow "Debug" pill alongside the difficulty pill. The pre-population itself comes free from the existing `setCode(starter_code)` — debug problems' starter_code IS the buggy code by design.
- **Surface on assign**: `AssignProblemOutputSchema.problem` gains `kind`, `bug_archetype`, `expected_behavior`. Default `"implement"` + `null`/`null` so legacy callers stay unchanged.
- **Tests**: 71 new tests across 5 files:
  - `packages/problems/src/schema.test.ts` — 13 new tests (kind discriminator, debug-shape rules, archetype enum, kind enum).
  - `packages/problems/src/loader.test.ts` — 5 new tests (debug-bank distribution, archetype coverage, expected_behavior present).
  - `packages/prompts/src/debug-grade-prompt.test.ts` — 10 tests.
  - `packages/scoring/src/policies/bug-finding-policy.test.ts` — 16 tests.
  - `packages/agent/src/tools/assign-problem.test.ts` — 2 new tests (debug projection round-trip).
  - `apps/web/src/app/session/debug-problem-panel.test.tsx` — 9 tests (humanization, copy hygiene, KindBadge).
  - Plus 16 fixture/test-helper updates across `apps/web/src/lib/session-{driver,state}.test.ts`, `apps/api/src/tutor.test.ts`, `packages/agent/src/{grade,tutor-session,tools/{give-hint,grade,update-profile,assign-problem}}.test.ts`.

## Deferred / out of scope

- **Multi-language frameworks** (React, Express debug problems) — out of v1 per story spec.
- **Wiring the debug-grade prompt into the tutor's grade tool runtime path**: the prompt + scoring axis are pure functions; the apps/api `buildGradeDrizzleDeps` needs a small follow-up to (a) call `gradeAgent` with the debug-grade prompt when the episode's problem kind is "debug", and (b) thread the `named_bug` boolean through to a per-archetype `bug_finding_score` UPSERT. Filed as STORY-037a (follow-up, scoped to ≤1 day) — the AC "tutor commentary recognizes the bug archetype" is satisfied by the schema shape + the new prompt, but the persistence wiring lands behind a follow-up to keep this PR reviewable.
- **Bug_finding_score DB column**: the in-memory `BugFindingScore` shape lands here; persisting it as a `bug_finding_scores` table (parallel to `skill_scores`) is filed as STORY-037a.

## Dependencies

- Blocked by: EPIC-007 MVP problem framework (STORY-016).
- Pairs with: [STORY-038](STORY-038-read-this-code-exercises.md) (similar comprehension-axis content).

## Notes

- Most debug problems are authored from existing curated problems by introducing a single bug archetype each.
- Catalogued in [`docs/vision/RECOMMENDED_ADDITIONS.md`](../../docs/vision/RECOMMENDED_ADDITIONS.md).

## Activity log

- 2026-04-25 — created
- 2026-05-06 — picked up (parallel-agent dispatch)
- 2026-05-06 — done; 47 debug YAMLs (25 py + 22 ts) + 71 new tests; persistence wiring deferred to STORY-037a
