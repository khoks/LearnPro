---
id: STORY-039f
title: 100-variant seeding CLI infrastructure (STORY-039 follow-up)
type: story
status: done
priority: P2
estimate: S
parent: EPIC-007
phase: v1-followup
tags: [problems, llm, content, cli, v1-followup]
created: 2026-05-11
updated: 2026-05-11
---

## Description

STORY-039 follow-up — ship the **CLI + batch-helper infrastructure** an operator needs to
seed the `problem_variants` cache with N variants per source problem. STORY-039 shipped the
pure `generateProblemVariant` agent + `POST /v1/problem-variants` Fastify route + migration
0023 cache table, but the AC #5 line ("100 variants seeded for launch") was explicitly
deferred — the actual seeding requires an operator with `ANTHROPIC_API_KEY` set (cost
estimate ~$10–40 for 100 attempts) and is **not** wired into CI.

This Story ships:

1. A reusable `seedVariantsForProblem` batch helper in `@learnpro/agent` that wraps
   `generateProblemVariant` with cache-aware top-up semantics (skip when cache already at
   quota, generate the missing slots, return counts).
2. A CLI at `packages/problems/src/seed-variants-cli.ts` that an operator can invoke via
   `pnpm --filter @learnpro/problems seed:variants -- --dry-run --count 3 --all-implement`
   to top up the cache. Supports per-source seeding, all-implement bulk seeding, language
   filtering, and a `--dry-run` mode that requires no API key.
3. Operator docs at `docs/operations/SEED_VARIANTS.md` covering prerequisites, cost
   estimate, example invocations, and recovery semantics (cache is idempotent).

The **actual seeding** (running with a real API key) remains an operator task — this Story
ships the *infrastructure* only.

## Acceptance criteria

- [x] New `seedVariantsForProblem({ llm, sourceProblem, targetCount, db, dryRun, telemetry })`
      batch helper in `@learnpro/agent` returns `{ generated, cached, would_generate? }` and
      short-circuits when the cache is already at or above the target count.
- [x] New CLI `packages/problems/src/seed-variants-cli.ts` exposed via the `seed:variants`
      script supports: `--source-slug <slug>`, `--all-implement`, `--count <n>` (1-20,
      default 3), `--dry-run`, `--language python|typescript|all` (default all).
- [x] CLI refuses to run without `ANTHROPIC_API_KEY` UNLESS `--dry-run` is set, with a
      clear error message.
- [x] CLI refuses to run without `DATABASE_URL` set, with a clear error message.
- [x] Dry-run mode runs the cache-check + log loop without ever calling the LLM and prints
      a summary of would-be-generated counts.
- [x] CLI streams progress to stdout (one line per source attempt) and ends with a summary
      of `total_succeeded / total_failed / total_cached_hit`.
- [x] Vitest unit tests for the batch helper (cache-empty / cache-partial / cache-full /
      dry-run paths, ≥6 cases).
- [x] Vitest unit tests for the CLI (dry-run happy path, missing source slug, missing API
      key without dry-run, ≥4 cases).
- [x] New `docs/operations/SEED_VARIANTS.md` covers prerequisites, cost estimate, example
      invocations, and recovery semantics.

## Tasks under this Story

(Inline — one PR ships the lot.)

## Dependencies

- Blocked by: [STORY-039](STORY-039-llm-problem-variants.md) (provides the agent + route +
  cache).
- Coexists with: [STORY-039a](STORY-039a-variant-piston-self-validation.md) (Piston
  self-validation) — when `LEARNPRO_VARIANT_SELF_VALIDATE=1` is set in the operator env,
  variants ALSO pass through the Piston gate, so a 100-attempt run may produce <100
  cached variants.

## Notes

- The actual seeding (running with `ANTHROPIC_API_KEY` against a real DB) is an
  **operator task**, not part of CI. This Story ships the infrastructure only; the
  operator decides when to burn the ~$10–40 to populate the cache.
- The cache is idempotent — reruns short-circuit on already-cached sources, so partial
  failures are safe to retry.

## Activity log

- 2026-05-11 — created, picked up
- 2026-05-11 — done. Merged via PR #78 at commit `3e2ded8`. Shipped the operator CLI in `packages/agent/src/seed-variants-cli.ts` (moved from `packages/problems` mid-PR to break a Turborepo workspace cycle; see DECISIONS_LOG 2026-05-11 entry). `pnpm --filter @learnpro/agent seed:variants -- --dry-run --count 3 --all-implement` previews; with `ANTHROPIC_API_KEY` set the real run tops up the `problem_variants` cache. Flags: `--source-slug`, `--all-implement`, `--count` (1-20), `--language`. Tests stub LLM + in-memory DB so CI never spends real money. New `docs/operations/SEED_VARIANTS.md` operator guide.
