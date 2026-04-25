# `packages/`

Shared TypeScript packages consumed by the `apps/`. Each package is its own pnpm workspace and publishes types from `src/index.ts`.

**Planned packages (created during MVP build):**

- `packages/shared/` — Zod schemas + shared TypeScript types used by both the API and the web client.
- `packages/db/` — Drizzle schema + migrations. Owns the Postgres connection pool.
- `packages/llm/` — `LLMProvider` interface + Anthropic adapter (+ stubbed OpenAI / Ollama adapters). See [ADR-0003](../docs/architecture/ADR-0003-llm-provider.md).
- `packages/sandbox/` — `SandboxProvider` interface + Piston-on-Docker impl. See [ADR-0002](../docs/architecture/ADR-0002-sandbox.md).
- `packages/agent/` — Tutor / grader / planner agent harnesses. Hand-rolled state machines, no LangChain.
- `packages/profile/` — Learner profile, skill scoring, heuristic difficulty tuner.
- `packages/notifications/` — `NotificationChannel` interface + Web Push impl.
- `packages/problems/` — Curated seed problem bank (~30 Python + ~30 TS for MVP).
- `packages/tracks/` — Track YAML files (Python fundamentals, TS fundamentals).

**Why packages instead of `apps/web/src/lib/`?** Cleaner boundaries make it harder for the web app to reach into agent/sandbox internals. Also enables a future CLI / mobile app to consume the same logic without duplication. See [ADR-0001](../docs/architecture/ADR-0001-monorepo.md).
