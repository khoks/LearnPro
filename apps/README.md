# `apps/`

Deployable applications. Each app is its own Next.js / Node service.

**MVP:** `apps/web/` will hold the Next.js 15 app (Auth.js, Monaco editor, dashboard, problem page, settings). It is not yet created — landing here in EPIC-002.

**Future apps that may live here:**

- `apps/runner/` — a thin HTTP wrapper around the Piston sandbox (if we choose to split the runner from the main API host for additional isolation).
- `apps/cron/` — scheduled jobs that don't fit the in-process BullMQ worker (likely lives inside `apps/web` for MVP).

See [docs/architecture/ARCHITECTURE.md](../docs/architecture/ARCHITECTURE.md) and [project/BOARD.md](../project/BOARD.md) for the live status of which apps exist.
