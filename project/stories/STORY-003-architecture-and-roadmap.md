---
id: STORY-003
title: Author architecture doc, 5 ADRs, MVP scope, and phased roadmap
type: story
status: in-progress
priority: P0
estimate: M
parent: EPIC-001
phase: scaffolding
tags: [docs, architecture, adr, roadmap]
created: 2026-04-25
updated: 2026-04-25
---

## Description

Lock the technical and scope decisions into durable, diff-able documents *before* any code is written. Future code reviews and Claude Code sessions cite these docs; "vibes" is not allowed to sneak in via session history.

Five Architecture Decision Records (ADRs) capture the hard choices that have already been made:

- **ADR-0001** — Monorepo: pnpm workspaces + Turborepo (rejected Nx as overkill, npm workspaces as too slow).
- **ADR-0002** — Sandbox: self-hosted Piston in Docker on WSL2 for MVP (rejected raw Docker exec, Judge0, gVisor-now). Includes the full hardening checklist.
- **ADR-0003** — LLM provider: Anthropic Claude as primary behind a `LLMProvider` interface (rejected vendor lock-in; OpenAI + Ollama are stubbed adapters).
- **ADR-0004** — Database: Postgres 16 + pgvector + Redis 7 (rejected adding Pinecone/Qdrant until pgvector demonstrably hurts).
- **ADR-0005** — License: BSL 1.1 with Change Date 2030-04-25 (rejected MIT/Apache because they don't protect the SaaS path; rejected AGPL because the audience hates it).

The roadmap pair fixes scope:

- **`MVP.md`** — the single learning loop, 4–8 weeks, 2 languages, no voice, no mobile.
- **`ROADMAP.md`** — MVP → v1 → v2 → v3 phased plan with rough month estimates.

## Acceptance criteria

- [x] `docs/architecture/ARCHITECTURE.md` describes the full tech stack, component boundaries, and adapter pattern.
- [x] All 5 ADRs exist, each with Context / Decision / Consequences / Alternatives sections.
- [x] `docs/roadmap/MVP.md` defines a single learning loop with a clear list of in-scope and out-of-scope features.
- [x] `docs/roadmap/ROADMAP.md` covers MVP → v1 → v2 → v3 with rough timing.
- [x] All cross-references between docs use relative paths and resolve.

## Dependencies

- Blocks: STORY-004 (tracking system populates Epics/Stories from the roadmap structure).
- Blocked by: STORY-002 (groomed features feed into MVP scope decisions).

## Tasks

- [TASK-011](../tasks/TASK-011-architecture-doc.md) — Author `ARCHITECTURE.md`
- [TASK-012](../tasks/TASK-012-write-adrs.md) — Write 5 ADRs
- [TASK-013](../tasks/TASK-013-mvp-and-roadmap.md) — Author `MVP.md` + `ROADMAP.md`

## Activity log

- 2026-04-25 — created
- 2026-04-25 — set to in-progress; all 3 child tasks completed during day-1 session
