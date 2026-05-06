# CLAUDE.md — Project context for Claude Code sessions

> **Phase: MVP build (active since 2026-04-25).** Application code in `apps/`, `packages/`, and `services/` is now welcome. PR-per-Story workflow into [`khoks/LearnPro`](https://github.com/khoks/LearnPro) is enforced — see "PR workflow" below.

This file is the entry point for any Claude Code session working in this repo. Read it first. Read [`project/BOARD.md`](./project/BOARD.md) second.

---

## Mission (one paragraph)

LearnPro is an adaptive, AI-tutored, self-hosted learning platform that teaches coding (and later ML / deep learning / building LLMs from scratch). It hosts containerized in-browser sandboxes for live code execution, builds a deep evolving profile of each learner (skill, pace, "sharpness," mastered vs. escaped concepts), generates a multi-horizon plan (session → day → week → mastery), adapts difficulty in real time based on time-to-solve and mistakes, optionally listens via mic like a human teacher would, gamifies progress, and eventually sends mobile/WhatsApp nudges to protect practice momentum. Self-hosted-first, open-source under BSL 1.1, SaaS later — and architected so the SaaS migration is a config flip, not a rewrite.

---

## Decisions locked

| Decision | Choice | Reason |
|---|---|---|
| MVP languages | Python + TypeScript | Fastest path; covers backend + frontend stories; biggest free problem banks |
| LLM provider (primary) | Anthropic Claude | Strong tool-use, reliable instruction following, behind a `LLMProvider` interface so swapping is trivial |
| Voice in MVP | Deferred to v1 | ~2 weeks of scope and real UX risk; ship text-only adaptive loop first |
| License | BSL 1.1 → Apache 2.0 (2030-04-25) | Free self-host, blocks competitor SaaS hosting until Change Date |
| Monorepo | pnpm workspaces + Turborepo | Sweet spot for a solo dev; converts to Nx later if needed |
| Frontend | Next.js 15 (App Router) + React 19 + TS, Tailwind + shadcn/ui, Monaco editor, Zustand + TanStack Query | Covered in [`docs/architecture/ARCHITECTURE.md`](./docs/architecture/ARCHITECTURE.md) |
| Backend | Node.js (Fastify) + TS, tRPC + REST adapter, BullMQ on Redis | Same |
| Sandbox (MVP) | Self-hosted Piston in Docker on WSL2, hardened (no-net, read-only, cgroups, seccomp, non-root) | [ADR-0002](./docs/architecture/ADR-0002-sandbox.md) |
| Databases | Postgres 16 + pgvector + Redis 7 + MinIO | [ADR-0004](./docs/architecture/ADR-0004-database.md) |
| Auth | NextAuth v5 (Auth.js), magic link + GitHub OAuth, DB-session strategy via Drizzle adapter; cross-app auth via the `sessions` cookie (no shared JWT secret) | STORY-005 |
| Policy adapters | Deterministic defaults at every cross-cutting seam (`SandboxProvider`, `LLMProvider`, `NotificationChannel`, `RateLimiter`, `UsageStore`, `InteractionStore`); swap-without-rewrite | STORY-057 |
| Interaction telemetry | 9-event `interaction_type` pgEnum + `episodes.interactions_summary` jsonb; Zod-validated client batches with 200-event cap; voice opt-in only | STORY-055 |
| Cost telemetry & budget | DB-backed `agent_calls` sink + per-user daily token budget with Opus → Sonnet → Haiku tier ladder (downgrade at 80%) | STORY-012 / STORY-060 |
| Coach-voice copy | All user-visible nudges/notifications/dashboard copy go through `@learnpro/notifications/copy` (or local copy module); forbidden-phrase tests reject FOMO/loss-aversion/streak-shaming | STORY-022 / STORY-023 / STORY-024 |
| MVP scope | **Substantially complete (2026-05-05).** Single learning loop end-to-end at API + UI; STORY-054 (adaptive autonomy controller) is the last MVP P0 in flight | [`docs/roadmap/MVP.md`](./docs/roadmap/MVP.md) |
| Primary OS for dev | Windows (WSL2 for Docker) | User's machine; Mac/Linux via adapters |

---

## Where to find things

### Docs

- **The user's original vision** (verbatim, untouched): [`docs/vision/RAW_VISION.md`](./docs/vision/RAW_VISION.md). Treat as source-of-truth for *intent*.
- **Groomed features (MVP/v1/v2/v3 tagged)**: [`docs/vision/GROOMED_FEATURES.md`](./docs/vision/GROOMED_FEATURES.md).
- **Gaps the user didn't mention but needs**: [`docs/vision/RECOMMENDED_ADDITIONS.md`](./docs/vision/RECOMMENDED_ADDITIONS.md).
- **Architecture & ADRs**: [`docs/architecture/`](./docs/architecture/). Update ADRs (or add new ones) for any architectural change.
- **MVP scope**: [`docs/roadmap/MVP.md`](./docs/roadmap/MVP.md).
- **Phased roadmap**: [`docs/roadmap/ROADMAP.md`](./docs/roadmap/ROADMAP.md).
- **Live work tracking**: [`project/BOARD.md`](./project/BOARD.md). **Read this every session before starting work.**
- **Decisions log** (lighter-weight than ADRs): [`docs/decisions/DECISIONS_LOG.md`](./docs/decisions/DECISIONS_LOG.md). Maintained automatically by the `harvest-knowledge` skill.
- **Novel / patentable ideas log**: [`docs/vision/NOVEL_IDEAS.md`](./docs/vision/NOVEL_IDEAS.md). Same skill maintains it.
- **Product strategy docs**: [`docs/product/COMPETITIVE.md`](./docs/product/COMPETITIVE.md), [`docs/product/DIFFERENTIATORS.md`](./docs/product/DIFFERENTIATORS.md), [`docs/product/UX_DETAILS.md`](./docs/product/UX_DETAILS.md).
- **Data retention & PII**: [`docs/security/RETENTION.md`](./docs/security/RETENTION.md) — windows + redaction patterns (STORY-056).

### Apps

- `apps/api` — Fastify HTTP API. Tutor / onboarding / sandbox / interactions / export / settings routes. Cross-app auth via the NextAuth `sessions` cookie.
- `apps/web` — Next.js 15 App Router. `/`, `/auth/signin`, `/onboarding`, `/dashboard`, `/session`, `/playground`, `/settings/*`. Monaco editor, axe-core a11y baseline, responsive at <768 / <1024 / 1024+.

### Workspace packages (`packages/*`)

- `@learnpro/shared` — Zod schemas + shared TS types crossing the API/web boundary; pure regex `redactPii` (5 PII categories incl. Luhn-checked credit cards).
- `@learnpro/db` — Drizzle schema + migrations + seed scripts; retention sweepers (`db:retention`); helper queries.
- `@learnpro/llm` — `LLMProvider` interface + Anthropic adapter; `BudgetGatedLLMProvider` decorator; `MODEL_PRICING` + `costFor()`.
- `@learnpro/sandbox` — `SandboxProvider` interface + hardened Piston-on-Docker impl; ADR-0002 breakout test harness (`LEARNPRO_REQUIRE_PISTON=1`).
- `@learnpro/agent` — Tutor harness (state machine + 4 tools: `assign-problem` / `give-hint` / `grade` / `update-profile`); session-plan agent.
- `@learnpro/prompts` — Versioned prompt registry (onboarding / hint / grade / session-plan).
- `@learnpro/scoring` — Heuristic difficulty tuner; XP / streak / per-track progress policies; DST-aware quiet-hours policy.
- `@learnpro/notifications` — `NotificationChannel` interface; in-app + Web Push channels; `QuietHoursDispatcher` decorator + deferred-flusher; coach-voice copy module.
- `@learnpro/redaction` — Haiku-second-pass PII redactor + `OrchestratedRedactor` (regex + LLM passes).
- `@learnpro/problems` — Curated seed bank (33 Python + 30 TS YAMLs with hidden tests); schema validators + idempotent seeder.
- `@learnpro/tracks` — Track YAML files + concept-ordering loader (Python fundamentals, TS fundamentals).

---

## Auto-housekeeping at session end

A project-scoped `Stop` hook in [`.claude/settings.json`](./.claude/settings.json) blocks the first stop attempt of each session and reminds Claude to run two skills before ending:

1. [**`harvest-knowledge`**](./.claude/skills/harvest-knowledge/SKILL.md) — extracts vision / architecture / decisions / novel ideas from the conversation and updates the matching docs.
2. [**`work-tracking`**](./.claude/skills/work-tracking/SKILL.md) — sweeps the conversation for new requirements / scope / status changes and updates Epics / Stories / Tasks + `BOARD.md`.

Once both have run (or you've explicitly skipped each with a one-line reason), `mkdir -p .claude/state && touch .claude/state/housekept-<session_id>` to release the hook so the session can stop. The hook also no-ops when `stop_hook_active=true` so it can never loop.

If you change `.claude/settings.json` mid-session, open the `/hooks` menu once or restart Claude Code so the watcher picks it up.

---

## The project tracking system is the source of truth

`project/` is a JIRA-style Epic → Story → Task hierarchy stored as markdown files in the repo. **Do not rely on session/conversation history to reconstruct what's done or pending.** The board is the source of truth.

Workflow for every session that touches code or scope:

1. Read [`project/BOARD.md`](./project/BOARD.md) — what's `in-progress`, what's `Up Next`?
2. Pick a Task (or get one from the user). Set its `status: in-progress`. Append to its activity log: `YYYY-MM-DD — picked up`. Update `BOARD.md`.
3. Do the work.
4. When complete, set `status: done`. Append: `YYYY-MM-DD — done`. Update `BOARD.md`. Commit.
5. New requirement from a discussion? **Create a Story** (or Task under an existing Story). Don't just remember it — write it down.
6. Cancelled scope? Set `status: canceled`, add reason to activity log.

Conventions are documented in [`project/README.md`](./project/README.md). Templates are in [`project/TEMPLATES/`](./project/TEMPLATES/).

---

## Coding standards (apply once code lands)

- **TypeScript strict mode.** No `any`. No `as` casts unless unavoidable and commented.
- **Zod at every boundary** (HTTP, DB row → app, env vars, LLM tool calls). Types derive from schemas, not the other way around.
- **No premature abstraction.** Three similar lines is better than a generic helper. Don't introduce adapters/interfaces beyond the ones documented in the architecture (`SandboxProvider`, `LLMProvider`, `NotificationChannel`, `ObjectStore`, `Auth`, `Telemetry`).
- **No SaaS plumbing in MVP.** Auth has the `org_id` column from day 1, but no billing, no admin panels, no multi-tenant UI until v3.
- **Comments are rare.** Default to none. Write one only when the *why* is non-obvious (hidden constraint, surprising invariant, workaround for a specific bug). Never describe what the code does — names should do that.
- **No dead code.** If you remove a feature, delete it. No `// removed` comments, no commented-out blocks.
- **Tests:** Vitest for units, Playwright for E2E. Hit a real Postgres in dev (Docker Compose), never mock the DB in integration tests.
- **Errors:** validate at boundaries, trust internal code. Don't add try/catch for impossible cases.
- **Coach-voice copy, no dark patterns.** All user-visible nudges, notifications, dashboard copy, and notification-center entries must be warm, calm, and never coercive. **Forbidden phrases** (enforced by tests in `packages/notifications/src/copy.test.ts`, `packages/scoring/src/policies/streak-policy.ts`, `apps/web/src/app/dashboard/dashboard-components.test.tsx`, etc.): "DON'T LOSE", "DAY X" of-streak shouting, FOMO timers, fire emoji 🔥, warning emoji ⚠️, all-caps imperatives, leaderboard threats. See STORY-022 / STORY-023 / STORY-024 for the enforcement pattern when adding new user-visible copy.

---

## Commit style

[Conventional Commits](https://www.conventionalcommits.org/), with a Task ID at the end:

```
feat(sandbox): wire Piston runner with seccomp profile [TASK-042]
fix(profile): correct decay formula off-by-one [TASK-051]
chore(project): mark TASK-007 done
docs(architecture): add ADR-0006 for tRPC vs. REST split
```

Types: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `perf`, `ci`, `build`. Scope is the package or area.

**Always reference the Task ID.** If there isn't one, create the Task first.

---

## PR workflow

All changes land via PRs into `main` on [`khoks/LearnPro`](https://github.com/khoks/LearnPro). Branch protection enforces this (PR required, 0 reviews needed, linear history, no force-push, no deletion). The assistant is authorized to **self-merge** *after* the design / requirement / algorithm / tech-stack alignment for the work has happened conversationally with the user.

**Branch naming:**

- Story work: `story/NNN-kebab-slug` — e.g. `story/052-monorepo-skeleton`
- Chore (no Story): `chore/<slug>` — e.g. `chore/lift-no-code-rule`
- Hotfix: `fix/<slug>`

**PR title:** same as commit style — `feat(scope): summary [STORY-NNN]`. Use **squash-merge** (linear history is enforced).

**PR body:** the [template](./.github/PULL_REQUEST_TEMPLATE.md) is auto-applied. Fill in all sections; tick the checklist honestly.

**When to pause and ask before merging:**

- Architectural decisions worthy of an ADR (push to a separate PR; let the user read first)
- New external dependencies, services, or paid integrations
- Anything that meaningfully changes a previously-locked decision in this file or in `docs/decisions/`
- Anything the user has explicitly asked to review

**Prompt-touching PRs** (any change to `packages/prompts/src/**` or `packages/agent/evals/**`) trigger the [`prompt-eval.yml`](./.github/workflows/prompt-eval.yml) workflow. It runs the [STORY-035](./project/stories/STORY-035-prompt-eval-harness.md) harness against the canned student transcripts, posts a markdown summary as a PR comment, and fails the check if any case regressed against the most-recent committed report on `main`.

The workflow needs **`ANTHROPIC_API_KEY`** set as a repo secret (Settings → Secrets and variables → Actions → New repository secret). Without it the workflow errors clearly and the PR is blocked from merging until either (a) the secret is added, or (b) the prompt-eval check is excluded from the branch-protection required-checks list. Cost per run: ~$0.50–$2 (Haiku judge + Haiku prompt-under-test).

---

## OS notes (Windows-first, but writing for cross-platform)

- Primary dev environment is Windows 11 with WSL2 for Docker.
- In code paths and shell commands, **use forward slashes** and POSIX-style paths. Tooling is configured via `.gitattributes` to normalize line endings.
- OS-specific bootstrap scripts live under `scripts/{windows,mac,linux}/`. Windows is the implemented one; mac/ and linux/ have stubs to be filled in later.
- Use bash syntax (not PowerShell) for any shell snippets in docs unless explicitly Windows-only.

---

## Always update an ADR for architectural decisions

If you change the tech stack, swap a library, change a security model, or alter how packages depend on each other — write an ADR in `docs/architecture/`. Format: `ADR-NNNN-short-slug.md`. Status (proposed / accepted / superseded), context, decision, consequences. Keep them short.

---

## The MVP gate

The MVP scope is fixed in [`docs/roadmap/MVP.md`](./docs/roadmap/MVP.md). Anything outside that scope:

- Goes into `project/` as a new Story under the relevant Epic, with `status: backlog` and `phase: v1` (or v2/v3).
- Does **not** land in MVP code.

Every "while we're at it…" idea is a chance to bloat the MVP into oblivion. Resist.

---

## Things to never do (without explicit user approval)

- `git push --force` to any branch (linear history is enforced on `main`; ask first if you genuinely need a force-push elsewhere)
- `git remote add` (origin is `khoks/LearnPro`; do not add additional remotes)
- Direct push to `main` (branch protection requires PR; use the PR workflow)
- Run `pnpm install`, `npm install`, or otherwise materialize `node_modules/` *outside* of an active Story that requires it (e.g. STORY-052 monorepo skeleton). Inform-then-do is fine within scope.
- Install Docker images or run docker-compose *outside* of an active Story that requires it. Inform-then-do is fine within scope.
- Use `--privileged` on any Docker invocation, ever
- Commit with `--no-verify` or any hook bypass

---

## When in doubt

1. Re-read this file.
2. Check [`project/BOARD.md`](./project/BOARD.md) for current state.
3. Check the relevant ADR.
4. Ask the user.
