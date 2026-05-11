# Self-hosting LearnPro: seeding the LLM-generated problem-variant cache

> Status: covers the `seed:variants` operator CLI introduced by [STORY-039f](../../project/stories/STORY-039f-variant-seeding-cli.md), on top of the variant pipeline from [STORY-039](../../project/stories/STORY-039-llm-problem-variants.md) and the Piston self-validation gate from [STORY-039a](../../project/stories/STORY-039a-variant-piston-self-validation.md).

LearnPro ships a curated bank of ~33 Python and ~30 TypeScript implement problems. To stretch that catalog further without rewriting every YAML by hand, the platform also keeps a cache of LLM-generated **variants** (same algorithm and concept tags, different cover story). The variants are produced by `generateProblemVariant` in `@learnpro/agent`, validated against `ProblemDefSchema`, optionally re-validated through Piston, and stored in the `problem_variants` Postgres table.

The on-demand `POST /v1/problem-variants` route lazy-generates variants when a user requests one. For a fresh self-hosted install you usually want to **pre-seed** a handful of variants per source so the first session feels rich. That's what this CLI is for.

## Prerequisites

- A running Postgres instance with the LearnPro schema migrated (`pnpm --filter @learnpro/db db:migrate`).
- All source problems already seeded (`pnpm --filter @learnpro/problems seed` — done automatically by `db:seed` in the standard bootstrap).
- For real (non-dry-run) seeding: an **Anthropic API key** with budget headroom. The CLI uses Haiku via `AnthropicSdkTransport`; pricing follows `MODEL_PRICING` in `@learnpro/llm`.
- Optional for the Piston self-validation gate: a running Piston runtime and `LEARNPRO_VARIANT_SELF_VALIDATE=1`. The CLI does **not** wire Piston directly today (it consumes the agent's no-sandbox path); to validate variants through Piston as well, prefer the API route or extend the CLI to inject a `SandboxProvider`.

## Env vars

| Variable | Required for | Notes |
|---|---|---|
| `DATABASE_URL` | All runs (including `--dry-run`) | Cache reads happen against the real DB so the dry-run can preview what's already covered. |
| `ANTHROPIC_API_KEY` | Real (non-dry-run) runs | The CLI refuses to start without it unless `--dry-run` is set. |
| `LEARNPRO_LLM_CONFIG` | Optional | JSON. Lets you pin a non-default Haiku model. Defaults to the agent's `ANTHROPIC_HAIKU` constant. |

## Cost estimate

Per variant attempt:

- One Haiku `complete()` call at `max_tokens: 2400`, `temperature: 0.6` — typically ~$0.005-0.015 in output tokens plus the system+user prompt input (negligible at Haiku rates).
- One retry on parse / self-validation failure — so worst-case ~2× the per-attempt cost.

In practice the total comes to roughly **$0.10-0.40 per successful cached variant** once you account for the retry loop and the occasional dropped output. Seeding 100 variants therefore runs **~$10-40**.

Add ~10-20% if you have `LEARNPRO_VARIANT_SELF_VALIDATE=1` wired through Piston — variants whose `reference_solution` fails its own hidden_tests are dropped, so 100 attempts may produce <100 cached rows.

Always start with `--dry-run` to confirm the source count and cache state before paying for tokens.

## Example invocations

Preview what a 3-per-source bulk seed would do, across both Python and TypeScript:

```bash
pnpm --filter @learnpro/problems seed:variants -- \
  --dry-run \
  --count 3 \
  --all-implement
```

Seed 5 variants for one specific source:

```bash
ANTHROPIC_API_KEY=sk-ant-... \
  pnpm --filter @learnpro/problems seed:variants -- \
    --count 5 \
    --source-slug reverse-string
```

Seed only Python sources, 3 variants each (the realistic v1-launch shape — Python is the broader v1 catalog):

```bash
ANTHROPIC_API_KEY=sk-ant-... \
  pnpm --filter @learnpro/problems seed:variants -- \
    --count 3 \
    --all-implement \
    --language python
```

## What you'll see

Per-source progress lines, one per attempted slot:

```
[seed:variants] sources=33 count=3 dryRun=false lang=python
[1/33] python:sum-even-numbers -> sum-even-numbers-variant-1 (ok, slot 1)
[1/33] python:sum-even-numbers -> sum-even-numbers-variant-2 (ok, slot 2)
[1/33] python:sum-even-numbers -> sum-even-numbers-variant-3 (ok, slot 3)
[2/33] python:reverse-list (skip: cached 3/3)
...
[seed:variants] summary: generated=87 failed=4 cached_total=92 active=29 skipped=4
```

`generated` counts fresh variants persisted this run. `failed` counts LLM attempts that produced no usable variant (parse fail, drift, duplicate slug, or sandbox-validation fail when wired). `cached_total` sums the pre-existing cached variants discovered during the run.

## Recovery — reruns are safe

The cache table is **idempotent on top-up**. If a run dies halfway (network blip, killed process, API quota hit), simply rerun the same command. The CLI:

1. Reads the existing cache for each source.
2. Short-circuits (no LLM call) when the cache already has ≥ `--count` rows.
3. Generates only the missing slots otherwise.

So a partial run that produced 50 of 100 variants can be resumed cleanly — the second run starts from 50 cached, attempts the remaining 50, and reports the totals.

## Cleaning up

To wipe and re-seed from scratch:

```sql
DELETE FROM problem_variants;
```

The next CLI run will repopulate. The `problem_variants` table has a FK with `ON DELETE CASCADE` from `problems.id`, so dropping a source problem also drops its cached variants automatically.

## Where this fits

This CLI is **the infrastructure half** of STORY-039's AC #5 ("100 variants seeded for launch"). The actual seeding decision — when to burn the budget, which language to prioritize, how many per source — is yours as the operator. The CLI exists so when you make that call, the path is one command away.
