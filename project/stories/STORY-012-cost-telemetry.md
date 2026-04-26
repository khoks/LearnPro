---
id: STORY-012
title: Per-call LLM cost & latency telemetry + per-user daily token budget
type: story
status: done
priority: P0
estimate: S
parent: EPIC-004
phase: mvp
tags: [llm, telemetry, cost-control]
created: 2026-04-25
updated: 2026-04-26
---

## Description

Every LLM call is logged with: `user_id`, `org_id`, `role` (tutor/grader/router), `model`, `prompt_tokens`, `completion_tokens`, `cost_usd`, `latency_ms`, `cached_tokens`, `tool_used`, `session_id`. This is the data that lets us answer "what does a typical learning session cost?" before scale becomes a surprise bill.

Layered on top: a per-user **daily token budget** (configurable, default 100k tokens). When 80% consumed, the tutor agent silently downgrades Opus → Sonnet → Haiku. At 100%, it serves a friendly "you've used your daily AI budget — try again tomorrow or upgrade" message. Self-hosted defaults to "no limit" but the plumbing is there for SaaS.

Goes through the `Telemetry` adapter from EPIC-015 (console impl in MVP, OpenTelemetry later).

## Acceptance criteria

- [x] **All telemetry fields are recorded** — `LLMTelemetryEvent` carries `provider`, `model`, `role`, `user_id`, `session_id` (new), `task`, `input_tokens`, `output_tokens`, `cached_tokens` (optional, for prompt-cache later), `cost_usd` (new), `pricing_version` (new), `tool_used` (optional, populated for tool calls), `latency_ms`, `ok`, `decided_at`, `prompt_version`. The `agent_calls` *table* + DB-backed sink land in [STORY-060](./STORY-060-agent-calls-db-sink.md) with the next batch of DB migrations — the schema and emission point are done; only persistence is split.
- [x] Daily token budget is enforced server-side (`BudgetGatedLLMProvider` decorator in `@learnpro/llm` — pre-call `assertWithinBudget` + post-call `record`, applied at the provider layer so any caller goes through it).
- [x] Graceful model-downgrade kicks in at the threshold (default 80%): `DailyTokenBudget.decideModel` walks the `MODEL_TIERS` ladder (premium=Opus → mid=Sonnet → cheap=Haiku) and downgrades by one tier when usage ≥ threshold. Explicit `req.model` always wins.
- [x] At 100%, `TokenBudgetExceededError` is thrown with a human-friendly message (`"Daily token budget exceeded for user X: used Y / limit Z"`). API-side mapping to a 429 + JSON body lands in [STORY-060](./STORY-060-agent-calls-db-sink.md) with the auth wiring.
- [x] Cost calculation uses a versioned price table — `MODEL_PRICING` in `packages/llm/src/pricing.ts`, stamped with `PRICING_VERSION = "2026-04-26"`. Append-only convention: bump the version + add a new row when prices change, never mutate in place. Unknown models record `cost_usd=0` + `known_model=false` so analytics can flag operator-stale tables without breaking the runtime path.

## Dependencies

- Blocked by: STORY-009 (LLM gateway). ✅
- Spawned: [STORY-060](./STORY-060-agent-calls-db-sink.md) — DB-backed `UsageStore` + `agent_calls` Drizzle migration + API 429 mapping. Kept separate so STORY-012 stays at S; STORY-060 lands with the next DB Story so the migration batches.

## Tasks

(Tracked inline in the activity log.)

## Activity log

- 2026-04-25 — created
- 2026-04-26 — picked up. Built versioned cost calculator (`pricing.ts` + `pricing.test.ts`), per-user daily budget tracker (`budget.ts` + `budget.test.ts` — `UsageStore` interface + `InMemoryUsageStore` + `DailyTokenBudget` with explicit/no_user/unlimited/under_threshold/downgraded reasons), and decorator pattern wrapping any `LLMProvider` (`budget-gated-provider.ts` + `budget-gated-provider.test.ts`). Extended `LLMTelemetryEventSchema` with `cost_usd`, `pricing_version`, optional `session_id`/`cached_tokens`/`tool_used`. Wired `costFor()` into `AnthropicProvider.recordTelemetry` so every call now stamps cost + version + tool name. Total: 38 new tests across 3 files, all green; 72 tests passing in `@learnpro/llm`.
- 2026-04-26 — done. Filed [STORY-060](./STORY-060-agent-calls-db-sink.md) for the deferred DB persistence layer (Drizzle migration + `DrizzleLLMTelemetrySink` + `DrizzleUsageStore` + API 429 mapping). Interfaces (`UsageStore`, `LLMTelemetrySink`) are stable; STORY-060 just adds Drizzle impls behind them.
