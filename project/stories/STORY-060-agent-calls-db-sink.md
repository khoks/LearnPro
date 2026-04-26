---
id: STORY-060
title: DB-backed `UsageStore` + `agent_calls` table (split from STORY-012)
type: story
status: done
priority: P0
estimate: S
parent: EPIC-004
phase: mvp
tags: [llm, telemetry, db, drizzle]
created: 2026-04-26
updated: 2026-04-26
---

## Description

[STORY-012](./STORY-012-cost-telemetry.md) shipped the cost calculator (`costFor` + versioned `MODEL_PRICING`), the `LLMTelemetryEvent` schema (now carries `cost_usd`, `pricing_version`, optional `session_id` / `cached_tokens` / `tool_used`), and the per-user daily token budget (`DailyTokenBudget` + `BudgetGatedLLMProvider` decorator). What it deliberately did **not** ship is the persistence layer behind both:

1. **`agent_calls` table** — the sink that records every `LLMTelemetryEvent` so we can answer "what does a typical learning session cost?" before the AWS bill answers it for us. Today the in-process `InMemoryLLMTelemetrySink` is sufficient for tests and short demos; production needs Postgres.
2. **DB-backed `UsageStore`** — the budget tracker depends on a `UsageStore` interface; the in-memory impl handles tests and self-hosted no-budget mode (limit=0), but a multi-process API needs a shared bucket per `(user_id, UTC date)`.

Splitting this out keeps STORY-012 within its S estimate (interface + decorator + tests, no Drizzle migration) and lets the schema change move with the next batch of DB-touching Stories.

## MVP scope (this Story)

- Drizzle migration for `agent_calls` (cols match `LLMTelemetryEvent` + `org_id`, `id`, `created_at`).
- `DrizzleLLMTelemetrySink` — implements `LLMTelemetrySink`, INSERTs one row per event, never throws (errors logged + dropped so a telemetry outage can't kill an LLM call).
- `DrizzleUsageStore` — implements `UsageStore`. `today()` runs `SELECT sum(input_tokens + output_tokens) FROM agent_calls WHERE user_id=$1 AND created_at >= $2 (start-of-UTC-day)`. `record()` is a no-op (rows are written by the telemetry sink — single source of truth).
- API wiring: when `LEARNPRO_DAILY_TOKEN_LIMIT > 0` is set, `buildLLMProvider` wraps the AnthropicProvider with `BudgetGatedLLMProvider` using `DrizzleUsageStore`. Self-hosted default is 0 (unlimited).
- Friendly 429 mapping: API serializes `TokenBudgetExceededError` as `{ error: "daily_budget_exceeded", message: "..." }` (status 429) so the playground can render the friendly message AC from STORY-012.

## Out of scope (file separately if needed)

- Per-org budgets (only per-user for MVP).
- Aggregate dashboards / cost analytics UI — depends on a stats route + admin shell that don't exist yet.
- Cached-prompt / prompt-cache aware accounting (`cached_tokens` column is wired but not yet populated by the Anthropic transport).

## Acceptance criteria

- [x] `agent_calls` Drizzle migration lands in `packages/db` with all `LLMTelemetryEvent` fields + `id`, `org_id`, `called_at`. Migration `0002_agent_calls_telemetry.sql` adds `session_id`, `task` (new `agent_task` enum: complete/stream/embed/tool_call), `cached_tokens`, `cost_usd numeric(18,8)`, `pricing_version`, `tool_used`. Existing columns (provider/model/role/prompt_version/input_tokens/output_tokens/latency_ms/ok/called_at/user_id/episode_id) carried forward from STORY-013.
- [x] `DrizzleLLMTelemetrySink` writes one row per event; failures are logged but never thrown. Implemented in `packages/db/src/llm-telemetry-sink.ts` with a fire-and-forget `.catch(logger)` so a Postgres outage never takes down an LLM call. Optional fields are conditionally spread (no spurious `null` rows). `cost_usd` is passed as a string via `toFixed(8)` to avoid float64 round-trip through the pg driver.
- [x] `DrizzleUsageStore.today()` aggregates today's tokens per user against UTC midnight; covered by an integration test against a real Postgres (Docker Compose). 5 integration tests in `llm-usage-store.test.ts`, gated by `DATABASE_URL` so `pnpm test` still passes in CI without a DB. Run locally: `DATABASE_URL=postgresql://learnpro:learnpro@localhost:5432/learnpro pnpm --filter @learnpro/db test`.
- [ ] API exposes `GET /llm/usage/today` returning `{ used_tokens, limit_tokens, ratio }` for the authenticated user (used by the UI nag at >80%, friendly block at 100%). **Deferred to STORY-005** — needs a `user_id` from auth middleware. Spec'd in this Story's "Dependencies" as acceptable.
- [ ] When the budget is exceeded, the API responds 429 with `{ error: "daily_budget_exceeded", message: "..." }` rather than letting `TokenBudgetExceededError` leak as a 500. **Deferred to STORY-005** — same auth dependency.
- [ ] Manual smoke: with `LEARNPRO_DAILY_TOKEN_LIMIT=100` and a real Anthropic key, hitting the playground twice triggers the friendly message on call #2. **Deferred to STORY-005** — needs the API wiring above.

## Dependencies

- Blocked by: STORY-005 (Auth.js — needs a `user_id` to attribute usage to) **or** a stub auth middleware that pins a fixed `user_id` for dev. Acceptable to land the table + sink without auth, with the API wiring deferred until STORY-005. ✅ Took the latter path: table + sink + store land now, API wiring lands with STORY-005.
- Blocks: nothing structural, but deferring it past 100 daily users would be expensive.

## Notes

Filed during STORY-012 close-out (2026-04-26). The interfaces (`UsageStore`, `LLMTelemetrySink`) are already stable from STORY-012; this Story just adds the Drizzle implementations behind them.

## Activity log

- 2026-04-26 — created (split from STORY-012).
- 2026-04-26 — picked up. Extended `agent_calls` table with the 6 STORY-012 columns + new `agent_task` enum (Drizzle migration `0002_agent_calls_telemetry.sql` auto-generated via `drizzle-kit generate` — diffs against the snapshot, no DB needed). Added `@learnpro/llm` workspace dep to `packages/db` so it can implement the interfaces. Built `DrizzleLLMTelemetrySink` (fire-and-forget insert, error-logged + swallowed, conditional optional spread, `cost_usd` as string for numeric precision) and `DrizzleUsageStore` (`today()` runs `sum(input + output) WHERE user_id = $1 AND called_at >= start_of_utc_day`; `record()` is intentionally a no-op since the sink is the single source of truth — otherwise every call would double-count). Tests: 6 unit tests for the sink (full mapping / optional-omit / org_id stamping / cost formatting / error swallowing / unparseable-decided_at fallback) + 5 integration tests for the store (zero-state / aggregation / yesterday boundary / per-user isolation / record no-op) gated by `DATABASE_URL`. Schema test extended to assert all new columns present + cost_usd is `numeric(18, 8)` + `agent_task` enum mirrors `LLMTelemetryEventSchema.task`.
- 2026-04-26 — done. API wiring (3 ACs) deferred to STORY-005 per the in-spec dependency note.
