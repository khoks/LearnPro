---
id: EPIC-019
title: Build foundation — monorepo, dev env, shared interfaces
type: epic
status: in-progress
priority: P0
phase: mvp
tags: [foundation, monorepo, infra, dx]
created: 2026-04-25
updated: 2026-04-26
---

## Goal

Stand up the foundational build infrastructure that every other code Story depends on: the pnpm-workspaces + Turborepo monorepo skeleton, the local Docker Compose dev env, and the cross-cutting policy-adapter interfaces that operationalize Path A (deterministic defaults now, GenAI swap-ins in v1 — see [`docs/decisions/DECISIONS_LOG.md`](../../docs/decisions/DECISIONS_LOG.md) 2026-04-25 entry).

## Scope

- Monorepo skeleton (`apps/web`, `apps/api`, `packages/{db,llm,sandbox,scoring,prompts,shared}`).
- Local dev: `docker-compose.yml` with Postgres + pgvector + Redis + MinIO + Piston.
- Shared TS / lint / format / test config.
- First CI workflow (lint + typecheck + unit tests on PR).
- Cross-cutting policy-adapter interfaces (`ScoringPolicy`, `TonePolicy`, `DifficultyPolicy`, `AutonomyPolicy`) with deterministic default implementations.

## Out of scope

- Any user-facing feature (downstream Stories under their respective Epics).
- Production Dockerfile / cloud deploy infra (separate work under EPIC-015).
- Real DB schema for app tables (lands in STORY-013 under EPIC-005).
- Real LLM / sandbox calls (land in STORY-009 / STORY-007 / STORY-008).

## Stories under this Epic

- [STORY-052](../stories/STORY-052-monorepo-skeleton.md) — Monorepo skeleton + dev Docker Compose
- [STORY-057](../stories/STORY-057-policy-adapter-interfaces.md) — Policy-adapter interfaces + deterministic defaults

## Exit criteria

- [x] `pnpm install && pnpm dev` brings up `apps/web` + `apps/api` from a clean clone. _(STORY-052)_
- [x] `docker compose up -d` brings up the four backing services. _(STORY-052 — config landed; full container start verified by next dev to bring the stack up)_
- [x] CI on PR is green. _(STORY-052)_
- [ ] Four policy interfaces defined with deterministic default implementations and DI wired. _(STORY-057)_
- [ ] No user-facing feature blocked on "where does this code live?" anymore. _(half — workspace is real, policy interfaces still pending)_

## Related

- [`docs/architecture/ARCHITECTURE.md`](../../docs/architecture/ARCHITECTURE.md)
- [`docs/decisions/DECISIONS_LOG.md`](../../docs/decisions/DECISIONS_LOG.md) — 2026-04-25 Path A entry
- [ADR-0006](../../docs/architecture/ADR-0006-agentic-orchestration.md) — single-agent harness with workflow-routed model selection

## Activity log

- 2026-04-25 — created (Path A scope confirmation)
- 2026-04-26 — STORY-052 done (PR #5, squash `357eea9`). Workspace + dev compose + CI live. Next up: STORY-057 (policy-adapter interfaces).
