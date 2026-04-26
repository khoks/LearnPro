---
id: STORY-052
title: Monorepo skeleton + dev Docker Compose
type: story
status: in-progress
priority: P0
estimate: L
parent: EPIC-019
phase: mvp
tags: [foundation, monorepo, docker, dx]
created: 2026-04-25
updated: 2026-04-26
---

## Description

Stand up the pnpm-workspaces + Turborepo monorepo skeleton plus the local dev `docker-compose.yml`. Every other code Story depends on this — without it there is nowhere for `apps/web`, `apps/api`, `packages/scoring`, etc. to live.

This is foundational infrastructure, not a user-facing feature, but it is the prerequisite for *every* user-facing feature to land.

## Scope

- pnpm workspaces config + Turborepo `turbo.json`.
- Initial workspace layout per [ARCHITECTURE.md](../../docs/architecture/ARCHITECTURE.md):
  - `apps/web` (Next.js 15 / React 19 / TS) — bare scaffold
  - `apps/api` (Fastify / TS / tRPC) — bare scaffold
  - `packages/db` — Drizzle ORM schema package (empty schema; tables land in STORY-013)
  - `packages/llm` — `LLMProvider` interface + Anthropic adapter stub (real impl in STORY-009)
  - `packages/sandbox` — `SandboxProvider` interface + Piston adapter stub (real impl in STORY-007 / STORY-008)
  - `packages/scoring` — placeholder for the policy-adapter interfaces (real impls in [STORY-057](./STORY-057-policy-adapter-interfaces.md))
  - `packages/prompts` — empty; populated as tutor prompts land
  - `packages/shared` — Zod schemas + shared types
- Root-level shared config: `tsconfig.base.json`, `.eslintrc.json`, `prettier.config.js`, `vitest.config.ts`.
- `docker-compose.yml` for local dev: Postgres 16 + pgvector, Redis 7, MinIO, Piston runner. Ports + volumes documented in `scripts/windows/dev-up.ps1` and stub `scripts/{mac,linux}/dev-up.sh`.
- A single `pnpm dev` (turbo) that boots `apps/web` + `apps/api`.
- A first GitHub Actions workflow: lint + typecheck + unit tests on PR (no E2E yet).
- Smoke test: `apps/web` renders a `/health` page; `apps/api` exposes `/health` returning `{ ok: true, version }`.

## Out of scope

- Any app feature (auth, editor, problems) — those are downstream Stories.
- Real DB migrations — schema lands in STORY-013.
- Real LLM calls — gateway lands in STORY-009.
- Real sandbox execution — runners land in STORY-007 / STORY-008.
- Production Dockerfile / deploy infra — separate Story under EPIC-015.

## Acceptance criteria

- [ ] `pnpm install` completes from a clean clone on Windows + WSL2.
- [ ] `pnpm dev` boots `apps/web` (port 3000) + `apps/api` (port 4000).
- [ ] `apps/web` `/health` page renders.
- [ ] `apps/api` `/health` endpoint returns `{ ok: true, version: <pkg.version> }`.
- [ ] `docker compose up -d` starts Postgres + Redis + MinIO + Piston; all containers healthy.
- [ ] `pnpm lint && pnpm typecheck && pnpm test` all pass on the empty scaffold.
- [ ] CI workflow runs on PR and goes green.
- [ ] README updated with quick-start (clone → install → compose up → dev).

## Dependencies

- Blocked by: none (this is the first build Story).
- Blocks: every other code Story.

## Notes

- This is the first Story to **lift the install-deps and run-docker guardrails** in CLAUDE.md within scope. The PR will document each `pnpm install` and `docker compose pull` action.
- Per the user's "substantive deliverables" guidance, this Story is intentionally scoped large (L) so the first PR lands a runnable end-to-end skeleton, not a half-skeleton.

## Activity log

- 2026-04-25 — created (Path A scope confirmation)
- 2026-04-26 — picked up; scaffolding created (apps/web, apps/api, 6 packages, dev compose, CI); smoke verified locally (`pnpm install`, `pnpm typecheck`, `pnpm test`, `pnpm lint` all green)
