---
id: TASK-012
title: Write 5 ADRs (monorepo, sandbox, llm-provider, database, license)
type: task
status: done
priority: P0
estimate: M
parent: STORY-003
epic: EPIC-001
phase: scaffolding
tags: [docs, adr, architecture]
created: 2026-04-25
updated: 2026-04-25
---

## Description

Five Architecture Decision Records, each with Context / Decision / Consequences / Alternatives sections:

- **ADR-0001-monorepo** — pnpm workspaces + Turborepo (vs. Nx, npm workspaces, polyrepo).
- **ADR-0002-sandbox** — Piston on Docker (WSL2) for MVP with full hardening checklist (vs. raw Docker exec, Judge0, gVisor-now, Firecracker-now).
- **ADR-0003-llm-provider** — Anthropic primary behind `LLMProvider` interface (vs. vendor-locked OpenAI, vs. LangChain).
- **ADR-0004-database** — Postgres 16 + pgvector + Redis (vs. separate vector DB).
- **ADR-0005-license** — BSL 1.1 with Change Date 2030-04-25 (vs. MIT/Apache, vs. AGPL).

## Acceptance criteria

- [x] All 5 ADR files exist in `docs/architecture/`.
- [x] Each ADR follows Context / Decision / Consequences / Alternatives structure.
- [x] Each ADR cites the alternatives considered and why they were rejected.

## Dependencies

- Blocked by: TASK-011

## Activity log

- 2026-04-25 — created
- 2026-04-25 — done
