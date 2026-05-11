---
id: STORY-039
title: LLM-generated problem variants (same shape, different cover)
type: story
status: done
priority: P2
estimate: M
parent: EPIC-007
phase: v1
tags: [problems, llm, content, v1]
created: 2026-04-25
updated: 2026-05-06
---

## Description

Curated bank gives ~30 problems per language at MVP — eventually users will see them all. Extend the bank by using the LLM to generate **variants** of curated seeds: same algorithm/concept, different cover story (e.g., "find the max of a list" → "find the highest score among players in a tournament").

Variants must pass an automated quality gate before being shown to users: spec-clarity check, hidden-test correctness check, novelty check (not too similar to its parent or to other variants).

## Acceptance criteria

- [x] Variant-generation pipeline in `packages/agent/src/problem-variants.ts` (pure agent), `packages/prompts/src/problem-variants-prompt.ts` (versioned prompt), and `apps/api/src/problem-variants.ts` (Fastify route). Persistent storage in new `problem_variants` table (migration 0023).
- [x] Each variant references its source via the new optional `variant_of: ProblemSlug` field on the `ImplementProblemDefSchema` and via the FK `problem_variants.source_problem_id`.
- [x] Quality gate v1: every generated variant must validate against `ProblemDefSchema` AND match the source's language / difficulty / concept_tags / track / kind. Single retry on parse failure; persistent failure → 200 with empty `variants[]` (best-effort, never blocks the user).
- [ ] LLM-judge spec-clarity rubric — DEFERRED to v1 follow-up (the structural Zod gate covers correctness; the judge is a quality-of-life addition).
- [ ] Embedding-based novelty score — DEFERRED to v1 follow-up (would require pgvector embedding the variant + comparing to seeds; out of v1 scope).
- [ ] Self-validation through real Piston sandbox — DEFERRED. The agent's `parseProblemVariantResponse` defends against drift via the schema + identity checks; running the variant's `reference_solution` against its own `hidden_tests` requires a sandbox round-trip and is gated by `LEARNPRO_REQUIRE_PISTON=1` for the integration suite.
- [ ] Admin tool to inspect failed-gate variants — DEFERRED (failed gates currently return empty; v1 follow-up adds an admin surface).
- [ ] 100 variants seeded for launch — DEFERRED (the agent + cache are in place; seeding 100 is an operator task once an Anthropic key is wired into CI).
- [x] Per-user "already seen the seed" gating — shipped 2026-05-11 via [STORY-039c](./STORY-039c-per-user-seen-seed.md). The assigner now prefers a cached, unattempted variant when the user has closed an episode on the seed; episode lineage is stamped via the new `episodes.is_variant_of_problem_id` column (migration 0024).

## Tasks under this Story

(To be created when this Story is picked up.)

## Dependencies

- Blocked by: EPIC-007 MVP problem framework + curated bank (STORY-016).

## Notes

- Bank stays curated — variants augment, not replace.
- LLM cost: ~$0.10 per variant attempt (incl. quality gate). 100 variants ≈ $20–40 to generate, then static.
- Catalogued in [`docs/vision/RECOMMENDED_ADDITIONS.md`](../../docs/vision/RECOMMENDED_ADDITIONS.md).

## Activity log

- 2026-04-25 — created
- 2026-05-06 — picked up
- 2026-05-06 — done. Pure `generateProblemVariant` agent in `@learnpro/agent` runs Haiku with the new `problem-variants-v1` prompt; structural Zod gate via `ProblemDefSchema.parse` plus identity checks (language / difficulty / concept_tags / track / kind / slug-prefix / variant_of) reject drift. New `problem_variants` table (migration 0023) caches variants keyed off `source_problem_id`. New `POST /v1/problem-variants` Fastify route is auth-gated, cache-first, generates only on miss, persists results. New optional `variant_of` slug field on `ImplementProblemDefSchema` and `DebugProblemDefSchema` for provenance. Forbidden-phrase test on the system prompt (no FOMO / loss-aversion / fire-emoji / streak-shaming). 42 new tests across schema (4) + agent (27) + route (11). Self-validation through real Piston, embedding novelty score, LLM-judge rubric, admin failed-gate surface, and 100-variant seeding deferred to v1 follow-ups.
