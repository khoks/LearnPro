# LearnPro

> An adaptive, AI-tutored, self-hosted learning platform that teaches coding (and later, ML / deep learning / building LLMs from scratch).

LearnPro hosts a containerized in-browser sandbox where you write and run code, while an LLM-backed tutor agent builds an evolving profile of your skills, pace, strengths, and gaps — and uses it to plan your next session, day, week, and long-term mastery roadmap. Adaptive problem difficulty, hint laddering, and minimal-but-humane gamification make it feel like a teacher who actually knows you.

Self-hosted-first, open-source under [BSL 1.1](./LICENSE) (auto-converts to Apache 2.0 in 2030). SaaS later.

## Status

**MVP single-learning-loop end-to-end (April–May 2026).** The full loop — sign in → onboarding → track recommendation → tutor assigns a problem → editor → sandbox run → grader feedback → tutor explains → next problem with adapted difficulty — works end-to-end at both the API and UI layers. See [`docs/roadmap/MVP.md`](docs/roadmap/MVP.md) for what's shipped vs. v1 backlog, and [`project/BOARD.md`](project/BOARD.md) for the live status board.

Remaining MVP P0 work: STORY-054 (adaptive autonomy controller).

## Quick start (dev)

Prerequisites: Node 20+, pnpm 9 (enforced via `packageManager`), Docker Desktop with the WSL2 backend on Windows (or Docker Engine on Linux/Mac).

```bash
# 1. Clone
git clone https://github.com/khoks/LearnPro.git && cd LearnPro

# 2. Install dependencies
pnpm install

# 3. Start the dev infra (Postgres+pgvector, Redis, MinIO, Piston sandbox)
docker compose -f infra/docker/docker-compose.dev.yaml up -d

# 4. Migrate + seed the database (creates tables, loads tracks + curated problems)
pnpm --filter @learnpro/db db:migrate
pnpm --filter @learnpro/db db:seed

# 5. Boot apps/web (port 3000) and apps/api (port 4000)
pnpm dev
```

Or run them separately in two terminals:

```bash
pnpm --filter @learnpro/api dev
pnpm --filter @learnpro/web dev
```

Smoke check:

- Web: <http://localhost:3000> — sign in via the magic-link form. With `EMAIL_SERVER` unset (the default), the link is logged to the API stdout — copy-paste it into the browser.
- API: <http://localhost:4000/health>

Single-command Windows variant (boots Docker stack + tails logs):

```powershell
./scripts/windows/dev-up.ps1
```

(Mac / Linux: `./scripts/mac/dev-up.sh` or `./scripts/linux/dev-up.sh`.)

## Architecture at a glance

Two apps and eleven workspace packages. See [`docs/architecture/ARCHITECTURE.md`](./docs/architecture/ARCHITECTURE.md) for the long form.

**Apps**

- `apps/api` — Fastify HTTP API. Hosts the tutor / onboarding / sandbox / interactions / export routes; cross-app auth via the NextAuth `sessions` cookie.
- `apps/web` — Next.js 15 App Router. Pages for `/`, `/auth/signin`, `/onboarding`, `/dashboard`, `/session`, `/playground`, `/settings/data`. Monaco editor, axe-core a11y baseline, responsive at <768 / <1024 / 1024+.

**Packages**

- `@learnpro/shared` — Zod schemas + shared TS types crossing the API/web boundary; pure regex `redactPii` (5 PII categories).
- `@learnpro/db` — Drizzle schema + migrations + seed scripts; retention sweepers; helper queries.
- `@learnpro/llm` — `LLMProvider` interface + Anthropic adapter; cost telemetry + per-user daily token budget with Opus → Sonnet → Haiku tier ladder.
- `@learnpro/sandbox` — `SandboxProvider` interface + hardened Piston-on-Docker impl; ADR-0002 breakout test harness.
- `@learnpro/agent` — Tutor harness (state machine + 4 tools: `assign-problem`, `give-hint`, `grade`, `update-profile`); session-plan agent.
- `@learnpro/prompts` — Versioned prompt registry (onboarding, hint, grade, session-plan).
- `@learnpro/scoring` — Heuristic difficulty tuner; XP / streak / per-track progress policies; DST-aware quiet-hours policy.
- `@learnpro/notifications` — `NotificationChannel` interface; in-app + Web Push channels; `QuietHoursDispatcher` decorator + deferred-flusher.
- `@learnpro/redaction` — Haiku-second-pass PII redactor + `OrchestratedRedactor` composing the regex + LLM passes.
- `@learnpro/problems` — Curated seed bank (33 Python + 30 TypeScript YAMLs with hidden tests); schema validators + idempotent seeder.
- `@learnpro/tracks` — Track YAML files + concept-ordering loader (Python fundamentals, TS fundamentals).

## Stack

Next.js 15 + React 19 + TypeScript strict · Fastify · Drizzle + Postgres 16 + pgvector · Anthropic Claude (Opus / Sonnet / Haiku tier ladder) · Self-hosted Piston in Docker on WSL2 · NextAuth v5 (magic link + GitHub OAuth, DB sessions) · pnpm workspaces + Turborepo. See [`docs/architecture/ARCHITECTURE.md`](./docs/architecture/ARCHITECTURE.md) for the full version.

## Tests

```bash
# Repo-wide unit tests (vitest, via Turborepo)
pnpm test

# Just apps/web (includes axe-core a11y sweep at apps/web/src/test/a11y.test.tsx
# + responsive layout suite at apps/web/src/test/responsive.test.tsx)
pnpm --filter @learnpro/web test
```

Some integration suites are gated on `DATABASE_URL` and skip cleanly in CI when Postgres isn't available. The sandbox breakout suite is gated on `LEARNPRO_REQUIRE_PISTON=1` — without it, breakout tests run against a structural stub provider.

## License

[Business Source License 1.1](./LICENSE). Free to self-host for personal, team, school, or internal company use. Hosting LearnPro as a paid service to third parties is not permitted until the Change Date (2030-04-25), at which point this code converts to Apache License 2.0.

## Contributing

All changes land via PRs into `main` on [`khoks/LearnPro`](https://github.com/khoks/LearnPro). Branch protection enforces PR-required, linear history, no force-push, no deletion. PR-per-Story workflow is documented in [`CLAUDE.md`](./CLAUDE.md) — branches named `story/NNN-kebab-slug`, `chore/<slug>`, or `fix/<slug>`; commit messages follow [Conventional Commits](https://www.conventionalcommits.org/) with the Story / Task ID at the end.

## Where to look

- **Vision (verbatim user input):** [`docs/vision/RAW_VISION.md`](./docs/vision/RAW_VISION.md)
- **Groomed feature catalog:** [`docs/vision/GROOMED_FEATURES.md`](./docs/vision/GROOMED_FEATURES.md)
- **Architecture & ADRs:** [`docs/architecture/`](./docs/architecture/)
- **MVP scope:** [`docs/roadmap/MVP.md`](./docs/roadmap/MVP.md)
- **Roadmap (MVP → v1 → v2 → v3):** [`docs/roadmap/ROADMAP.md`](./docs/roadmap/ROADMAP.md)
- **Live status board (Epics / Stories / Tasks):** [`project/BOARD.md`](./project/BOARD.md)
- **For Claude Code sessions:** [`CLAUDE.md`](./CLAUDE.md)

## Platforms

Windows-first development; Mac/Linux supported via OS adapters. Browser app today → PWA in v1 → iOS/Android (Capacitor) in v2.
