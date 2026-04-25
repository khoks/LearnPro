---
id: TASK-007
title: Write CLAUDE.md
type: task
status: done
priority: P0
estimate: S
parent: STORY-001
epic: EPIC-001
phase: scaffolding
tags: [docs, claude-md, project-memory]
created: 2026-04-25
updated: 2026-04-25
---

## Description

`CLAUDE.md` orients future Claude Code sessions. Sections:
- Mission (one paragraph)
- Locked decisions table (stack, license, MVP languages, LLM provider, voice deferred)
- Where to find things (vision docs, ADRs, MVP scope, roadmap, **`project/BOARD.md`**)
- **Project tracking system is the source of truth** — every code session must update `project/` items as work progresses. Do not rely on chat history.
- Coding standards (TS strict, Zod at boundaries, no `any`, no premature abstractions, no SaaS plumbing in MVP)
- Commit style (Conventional Commits, reference Task IDs)
- OS notes (Windows + WSL2 primary; bash-style paths)
- "Always update an ADR for architectural decisions"
- The MVP gate (new ideas → backlog Stories, not MVP code)
- Things-to-never-do list (no `--privileged`, no urgency notification copy, no SaaS UI in MVP, etc.)

## Acceptance criteria

- [x] `CLAUDE.md` exists at repo root.
- [x] All sections above are present and substantive (not just headers).
- [x] A fresh Claude session in this folder can answer "what is this project, what's the stack, where is X, what's pending" using only `CLAUDE.md` + `BOARD.md`.

## Dependencies

- Blocked by: TASK-001

## Activity log

- 2026-04-25 — created
- 2026-04-25 — done
