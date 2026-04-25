---
id: TASK-011
title: Author docs/architecture/ARCHITECTURE.md
type: task
status: done
priority: P0
estimate: M
parent: STORY-003
epic: EPIC-001
phase: scaffolding
tags: [docs, architecture]
created: 2026-04-25
updated: 2026-04-25
---

## Description

The high-level technical map of LearnPro: tech stack (Next.js 15, React 19, TypeScript, Tailwind, Monaco, Fastify, tRPC, BullMQ, Drizzle, Postgres+pgvector, Redis, MinIO, Anthropic), component boundaries, the **adapter pattern** as the SaaS-readiness lever, the monorepo layout, top risks, and how all the ADRs hang together.

## Acceptance criteria

- [x] `docs/architecture/ARCHITECTURE.md` exists.
- [x] Stack, component boundaries, and monorepo layout documented.
- [x] All 6 adapter interfaces enumerated (`SandboxProvider`, `NotificationChannel`, `LLMProvider`, `ObjectStore`, `Auth`, `Telemetry`).
- [x] Cross-references to all 5 ADRs.
- [x] Top risks section present.

## Dependencies

- Blocked by: TASK-010

## Activity log

- 2026-04-25 — created
- 2026-04-25 — done
