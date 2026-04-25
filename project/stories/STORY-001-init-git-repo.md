---
id: STORY-001
title: Initialize git repo with Windows-friendly hygiene
type: story
status: in-progress
priority: P0
estimate: S
parent: EPIC-001
phase: scaffolding
tags: [git, hygiene, windows]
created: 2026-04-25
updated: 2026-04-25
---

## Description

Stand up `D:\DEV\ClaudeProjects\LearnPro` as a git repository with all the day-1 hygiene files needed before any code is written. The repo is **Windows-first** but must support Mac/Linux contributors later, so line-ending normalization and editor-config conventions matter from commit #1.

This story produces the boilerplate that an empty `git init` does *not* give you: `.gitignore` covering Node + Python + Docker + IDE + OS noise; `.gitattributes` enforcing LF in version control while keeping CRLF for Windows-only scripts; `.editorconfig`; `.nvmrc` pinning Node 20; `.env.example`; the BSL 1.1 `LICENSE`; the public `README.md`; and the `CLAUDE.md` that orients future Claude Code sessions.

## Acceptance criteria

- [x] `git init` succeeded and default branch is `main`.
- [x] `.gitignore` covers Node, Python, Docker, IDE (`.vscode`, `.idea`), OS (`Thumbs.db`, `.DS_Store`), and env files (`.env`, `.env.local`).
- [x] `.gitattributes` enforces `* text=auto eol=lf` with explicit CRLF for `.bat`, `.cmd`, `.ps1`.
- [x] `.editorconfig` sets UTF-8 + LF + 2-space indent (4 for `.py` and `.md`).
- [x] `.nvmrc` pins Node `20`.
- [x] `.env.example` lists placeholder env vars (no real secrets).
- [x] `LICENSE` is BSL 1.1 with Change Date 2030-04-25 and Additional Use Grant for self-hosting.
- [x] `README.md` has a one-paragraph mission and links to `docs/vision/RAW_VISION.md` and `docs/roadmap/MVP.md`.
- [x] `CLAUDE.md` is comprehensive enough that a fresh session can answer "what is this project, what's the stack, where is X, what's pending."

## Dependencies

- Blocks: STORY-002, STORY-003, STORY-004 (all docs/tracking work needs the repo to exist first).
- Blocked by: (none)

## Tasks

- [TASK-001](../tasks/TASK-001-git-init.md) — `git init` + set `main` as default
- [TASK-002](../tasks/TASK-002-write-gitignore.md) — Write `.gitignore`
- [TASK-003](../tasks/TASK-003-write-gitattributes.md) — Write `.gitattributes`
- [TASK-004](../tasks/TASK-004-write-editorconfig-nvmrc.md) — Write `.editorconfig`, `.nvmrc`, `.env.example`
- [TASK-005](../tasks/TASK-005-write-license.md) — Write `LICENSE` (BSL 1.1)
- [TASK-006](../tasks/TASK-006-write-readme.md) — Write `README.md`
- [TASK-007](../tasks/TASK-007-write-claude-md.md) — Write `CLAUDE.md`

## Activity log

- 2026-04-25 — created
- 2026-04-25 — set to in-progress; all 7 child tasks completed during day-1 session
