---
id: STORY-039g
title: Wire failureLogger into generateProblemVariant tryGenerateOne (STORY-039e glue)
type: story
status: backlog
priority: P2
estimate: S
parent: STORY-039
phase: v1
tags: [agent, variants, follow-up, glue]
created: 2026-05-11
updated: 2026-05-11
---

## Description

Deferred follow-up from STORY-039e. PR #76 squash-rebased STORY-039e onto a `main` that already had STORY-039d's spec-clarity judge integration (merged via PR #75). The two stories both modified `packages/agent/src/problem-variants.ts`, `packages/agent/src/problem-variants.test.ts`, `apps/api/src/problem-variants.ts`, and `apps/api/src/problem-variants.test.ts`. STORY-039d landed first and STORY-039e's agent-side `failureLogger` wiring conflicted non-trivially with the spec-clarity judge runtime flow.

The structural pieces of STORY-039e all shipped: the `variant_gate_failures` DB table (migration 0025), the `users.is_admin` column (migration 0026), the `@learnpro/db` helpers, the admin Fastify route at `GET /v1/admin/variant-failures`, and the Next.js admin page at `/admin/variant-failures`. The TABLE IS READY TO RECEIVE failure entries — what's missing is the AGENT writing to it.

This Story wires the agent to write. After this lands, the admin route will show real data; before, it shows an empty table.

## Acceptance criteria

- [ ] `packages/agent/src/problem-variants.ts` exports `VariantFailureEntry`, `VariantFailureLogger`, `VariantFailureReason` types (5-member discriminated union: `parse_error | identity_mismatch | spec_clarity_judge | self_validation | retry_exhausted`).
- [ ] `GenerateProblemVariantInput` gains optional `failureLogger?: VariantFailureLogger` and optional `source_problem_id?: string`. Existing callers without these fields keep working (no-op when omitted).
- [ ] `callOnce` returns a richer `CallOnceResult` with `model_id`, `failure_reason`, and `failure_detail` so the retry loop can log the right reason on parse / identity failures.
- [ ] `tryGenerateOne` calls `safeLogFailure(input.failureLogger, ...)` on EVERY failure path:
  - parse_error / identity_mismatch (when `callOnce` returns no variant)
  - self_validation (when sandbox validation fails — already gated by `if (input.sandbox !== undefined)`)
  - spec_clarity_judge (when STORY-039d's judge drops a variant — already gated by `if (input.judge !== undefined)`)
  - retry_exhausted (final entry emitted after the retry budget is spent)
- [ ] `apps/api/src/problem-variants.ts` builds a `failureLogger` via `buildDrizzleVariantFailureLogger` (already shipped in this file's STORY-039e contribution) and passes it to `generateProblemVariant`.
- [ ] `packages/agent/src/index.ts` re-exports the new `VariantFailureEntry`, `VariantFailureLogger`, `VariantFailureReason` types from `./problem-variants.js`.
- [ ] Tests in `packages/agent/src/problem-variants.test.ts` assert the logger is called with the right reason on each failure path (parse, identity, self_validation, spec_clarity_judge, retry_exhausted). Use stub loggers — no DB.
- [ ] Tests in `apps/api/src/problem-variants.test.ts` assert that on a failed gate (using a stub `fakeLlm` returning garbage for both attempts), a row is persisted to `variant_gate_failures`. Use the in-memory DB shim already in the file.
- [ ] Forbidden-phrase test on any new prompt copy (the new failure-reason addendum for the retry prompt) lands per repo convention.
- [ ] `pnpm format && pnpm format:check` clean.
- [ ] CI green on the PR.

## Tasks under this Story

(To be created when this Story is picked up.)

## Dependencies

- Blocked by: STORY-039e (the table + admin route — landed via PR #76)
- Blocked by: STORY-039d (the spec-clarity judge runtime integration — landed via PR #75; STORY-039g must preserve this)

## Notes

- The original STORY-039e branch had this wiring written. It's salvageable from the pre-rebase tip `b7c79fb` if needed: `git show b7c79fb:packages/agent/src/problem-variants.ts` (similar for the other 3 files). But it was written against a STORY-039d-less `main`, so applying it raw will revert the spec-clarity judge. The right move when picking this up is to read `b7c79fb`'s diff for guidance and re-write on top of current `main`.
- The squash-rebase commit message for PR #76 (commit `4edd8f1`) calls out this gap explicitly so future-me knows where the missing edge is.
- Cost: S — the structural code already exists, this is "thread the parameter through three call sites and re-add ~10 tests."

## Activity log

- 2026-05-11 — created. Deferred from STORY-039e via the squash-rebase fallback documented in `docs/decisions/DECISIONS_LOG.md` (2026-05-11 entry).
