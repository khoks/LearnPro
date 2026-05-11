---
id: STORY-039d
title: LLM-judge spec-clarity rubric for LLM-generated problem variants
type: story
status: done
priority: P2
estimate: S
parent: EPIC-007
phase: v1-followup
tags: [problems, llm, content, quality, v1-followup]
created: 2026-05-11
updated: 2026-05-11
---

## Description

STORY-039 follow-up — wires a second LLM call (a "spec-clarity judge") into the variant
pipeline so a structurally valid variant whose problem statement is ambiguous, whose examples
contradict the spec, or whose declared concept tags don't actually match the exercise is
dropped before being cached or surfaced to a user.

STORY-039 ships a structural Zod gate (`ProblemDefSchema.parse`) plus identity checks
(language / difficulty / concept_tags / track / kind / slug-prefix / variant_of). STORY-039a
adds a Piston self-validation gate (reference_solution must pass own hidden_tests). Those
two guards catch structural drift and reference-solution bugs, but they don't catch:

- Ambiguous statements ("Given a list of items, return the result") that pass schema but
  leave the learner guessing.
- Examples whose inputs and outputs disagree with the spec ("statement says positive
  integers; example uses negative numbers").
- Concept-tag mismatches ("`concept_tags: [recursion]` but the reference_solution uses a
  flat for-loop").

AC #3 of STORY-039 flagged this gap; this Story closes it by adding a Haiku-call judge that
scores the variant 1-5 on three criteria — `instruction_clarity` / `example_quality` /
`concept_match` — and drops the variant when `min(scores) < 3`.

The judge is gated by `LEARNPRO_VARIANT_SPEC_CLARITY_JUDGE=1` (default ON when
`ANTHROPIC_API_KEY` is set, OFF otherwise) so operators can disable the cost in environments
that don't want the round-trip (~$0.01 per variant).

## Acceptance criteria

- [x] New versioned prompt `packages/prompts/src/variant-spec-clarity-prompt.ts` with
      version tag `variant-spec-clarity-v1`. System prompt embeds the rubric (1-5 per
      criterion + one-sentence reasoning). Forbidden-phrase test on the system prompt.
- [x] New judge `packages/agent/src/variant-spec-clarity-judge.ts` exposes
      `runVariantSpecClarityJudge({ llm, variant })` returning
      `{ instruction_clarity, example_quality, concept_match, reasoning, pass }` where
      `pass = min(scores) >= 3`. Pure function — no DB / no telemetry inside. Zod-validated
      response with a single retry on parse failure; persistent failure → `{ pass: false }`
      (best-effort, never throws).
- [x] `generateProblemVariant` accepts an optional `judge?: SpecClarityJudge` parameter.
      When provided, after the structural Zod gate passes AND (when configured) Piston
      self-validation passes, run the judge. On `judge.pass === false`, drop the variant
      and increment a new `variants_dropped_spec_clarity` telemetry counter (added to
      `ProblemVariantsTelemetry`). Caller-controlled — existing callers don't break.
- [x] `apps/api/src/problem-variants.ts` route honors `LEARNPRO_VARIANT_SPEC_CLARITY_JUDGE`
      env flag (default ON when ANTHROPIC_API_KEY is set, otherwise OFF). When ON, passes
      `runVariantSpecClarityJudge` as the `judge` to `generateProblemVariant`.
- [x] Unit tests: passing scores → `pass: true`, one failing score → `pass: false`,
      malformed JSON → retry once then `pass: false`, forbidden-phrase test on the system
      prompt. ~8-10 tests (12 prompt + 25 judge = 37 actual).
- [x] Unit tests in `problem-variants.test.ts`: stub judge returning `pass: false` → variant
      dropped + `variants_dropped_spec_clarity` counter fired. Stub judge returning
      `pass: true` → variant returned as before. ~3-4 new tests (9 new agent tests + 8 new
      route tests = 17 actual).

## Deferred / explicitly-skipped

- Admin surface for inspecting failed-judge variants (matches STORY-039 AC #4 — same
  defer rationale).
- Embedding-based novelty score (STORY-039 AC unrelated to spec clarity).

## Implementation outline

1. `packages/prompts/src/variant-spec-clarity-prompt.ts`:
   - System prompt: "You judge a coding-problem variant on spec clarity. Score 1-5 per
     criterion; output strict JSON."
   - User prompt: variant `title` + `problem_statement` + `examples` + `constraints` +
     `concept_tags` + `hidden_tests`.
   - Forbidden-phrase test on the system prompt.
2. `packages/agent/src/variant-spec-clarity-judge.ts`:
   - Pure function `runVariantSpecClarityJudge({ llm, variant })`.
   - Zod schema for the response; single retry on parse failure.
   - Returns `{ pass: false }` on persistent failure (never throws).
3. Wire optional `judge` parameter into `generateProblemVariant`. Add
   `variants_dropped_spec_clarity` to `ProblemVariantsTelemetry`. Update unit tests.
4. `apps/api/src/problem-variants.ts`: read env flag, pass `runVariantSpecClarityJudge` as
   the `judge` when enabled.

## Pattern (commits)

1. STORY-039d story file pick-up commit.
2. Prompt + judge file + judge tests.
3. Wire judge into agent + agent tests.
4. Wire judge into Fastify route + env flag.
5. Mark STORY-039d done + update BOARD.md + STORY-039 AC tick.

## Dependencies

- Blocked by: [STORY-039](STORY-039-llm-problem-variants.md) (provides the agent + route +
  cache).
- Builds on: [STORY-039a](STORY-039a-variant-piston-self-validation.md) (the agent's
  optional-gate pattern is reused here).

## Notes

- The judge runs AFTER the structural Zod gate and (when wired) after Piston self-
  validation. This ordering minimizes cost — variants that fail cheaper gates never reach
  the LLM judge.
- Cost: ~$0.01 per variant (Haiku in/out at small token budgets). 100 variants ≈ $1.
- The judge is `Haiku` not `Sonnet` — the rubric is concrete enough that Haiku is reliable.
- Pure / no DB / no telemetry inside the judge. The caller fires the
  `variants_dropped_spec_clarity` counter when `pass: false` and the agent drops the
  variant. Keeps the judge module trivial to test.

## Activity log

- 2026-05-11 — created
- 2026-05-11 — picked up
- 2026-05-11 — done. New versioned `variant-spec-clarity-v1` prompt in `@learnpro/prompts`
  (system prompt embeds 1-5 rubric anchors per criterion + JSON output schema; forbidden-
  phrase tests guard against tone drift). New pure `runVariantSpecClarityJudge` agent in
  `@learnpro/agent` (Haiku call; Zod-validated response; single retry on parse failure;
  synthetic `{ pass: false }` on persistent failure — never throws to caller; `pass =
  min(scores) >= 3`). `generateProblemVariant` now accepts an optional
  `judge?: SpecClarityJudge` parameter; the judge runs AFTER the structural Zod gate and
  AFTER (when wired) Piston self-validation. New `variants_dropped_spec_clarity`
  telemetry counter on `ProblemVariantsTelemetry`. `PreviousFailure` widened to a
  discriminated union (`self_validation | spec_clarity`) so the retry prompt picks the
  right corrective phrasing — the spec-clarity addendum names the lowest-scoring
  criterion. New `buildVariantSpecClarityJudgeFromEnv` in `apps/api/src/problem-variants.ts`
  reads `LEARNPRO_VARIANT_SPEC_CLARITY_JUDGE` (default ON when `ANTHROPIC_API_KEY` is set;
  off otherwise). `defaultsFromEnv` wires the env builder. 54 new tests (12 prompt +
  25 judge + 9 agent + 8 route). 456 agent + 368 api tests pass repo-wide.
