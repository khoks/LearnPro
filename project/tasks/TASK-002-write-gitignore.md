---
id: TASK-002
title: Write .gitignore (Windows + Mac + Linux + Node + Python + Docker)
type: task
status: done
priority: P0
estimate: XS
parent: STORY-001
epic: EPIC-001
phase: scaffolding
tags: [git, hygiene]
created: 2026-04-25
updated: 2026-04-25
---

## Description

A `.gitignore` covering all the noise the repo will accumulate: Node (`node_modules`, `.next`, build artifacts), Python (`__pycache__`, `.venv`, `*.pyc`), Docker (`.docker`), IDEs (`.vscode/*` except shared settings, `.idea`), OS (`Thumbs.db`, `.DS_Store`, `desktop.ini`), env files (`.env`, `.env.local`).

## Acceptance criteria

- [x] `.gitignore` exists at repo root.
- [x] Covers Node, Python, Docker, IDE, OS, env-file patterns.
- [x] No real secrets accidentally tracked (verified by `git status` not showing `.env`).

## Dependencies

- Blocked by: TASK-001

## Activity log

- 2026-04-25 — created
- 2026-04-25 — done
