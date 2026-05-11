---
id: STORY-039a
title: Piston self-validation gate for LLM-generated problem variants
type: story
status: done
priority: P2
estimate: S
parent: EPIC-007
phase: v1-followup
tags: [problems, llm, sandbox, validation, v1-followup]
created: 2026-05-06
updated: 2026-05-11
---

## Description

STORY-039 follow-up — wire `validateProblem` from `@learnpro/problems` into the variant-generation
pipeline so the variant's `reference_solution` must pass its own `hidden_tests` before being
cached. STORY-039 already validates the variant's *structure* via `ProblemDefSchema.parse` plus
identity checks, but a structurally valid variant whose `reference_solution` doesn't actually pass
its `hidden_tests` is malformed and should never be cached or shown to users. AC #3 of STORY-039
flagged this as the missing acceptance gate; this Story closes it.

The validation is gated by `LEARNPRO_VARIANT_SELF_VALIDATE=1` (default ON) so operators can disable
the round-trip in environments without a sandbox. The Piston integration test follows the existing
pattern (`LEARNPRO_REQUIRE_PISTON=1`); default unit tests use a structural stub sandbox.

## Acceptance criteria

- [x] After Zod validation, run the variant's `reference_solution` through `validateProblem`
      against its own `hidden_tests` using a real sandbox.
- [x] If the validator passes → cache the variant.
- [x] If the validator fails → drop the variant, log the failure with the parsed-but-failing
      structure (operator can inspect later), best-effort retry once with a "fix the bug in your
      previous variant" prompt.
- [x] If the second attempt also fails → return empty for that source problem, log a clear warning.
- [x] Operator-controllable via env: `LEARNPRO_VARIANT_SELF_VALIDATE=1` (default ON). When OFF,
      behaves as STORY-039 (no validation gate).
- [x] Sandbox call gated by `LEARNPRO_REQUIRE_PISTON=1` env for the integration test (matches
      existing pattern). Default unit tests use a structural stub sandbox.

## Implementation outline

1. `packages/agent/src/problem-variants.ts`:
   - Add an optional `sandbox: SandboxProvider` dep to `generateProblemVariant`.
   - After Zod validation, when sandbox is wired, call `validateProblem(variant, sandbox)`.
   - On failure, retry once with an augmented prompt (carries the failing variant + a reason);
     on persistent failure, drop and continue.
   - Wire telemetry via an optional `onTelemetry` callback: count `variants_generated`,
     `variants_validated_pass`, `variants_dropped_fail`.
2. `apps/api/src/problem-variants.ts` route:
   - Wire `opts.sandbox` (already in `BuildServerOptions`) into the agent call.
   - Honor `LEARNPRO_VARIANT_SELF_VALIDATE` env flag — when `0` / `false` / `off`, omit the
     sandbox dep so the agent skips the validation step.
3. Tests:
   - Unit tests with a stub sandbox that controls pass/fail outcomes.
   - Integration test gated by `LEARNPRO_REQUIRE_PISTON=1`.

## Pattern (commits)

1. `generateProblemVariant` self-validation extension + telemetry counters + tests.
2. Retry-once-on-validator-fail logic (augmented prompt) + tests.
3. apps/api wiring + env flag + tests.
4. STORY-039a + BOARD.md update.

## Dependencies

- Blocked by: [STORY-039](STORY-039-llm-problem-variants.md) (provides the agent + route + cache).
- Reuses: [STORY-016](STORY-016-seed-bank.md) `validateProblem` infra (single-file + multi-file
  harness builder).

## Activity log

- 2026-05-06 — created
- 2026-05-06 — picked up
