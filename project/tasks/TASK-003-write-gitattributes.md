---
id: TASK-003
title: Write .gitattributes (LF normalization, CRLF for Windows scripts)
type: task
status: done
priority: P0
estimate: XS
parent: STORY-001
epic: EPIC-001
phase: scaffolding
tags: [git, line-endings, windows]
created: 2026-04-25
updated: 2026-04-25
---

## Description

Critical for a Windows-first repo that will eventually have Mac/Linux contributors. `* text=auto eol=lf` normalizes line endings to LF in version control while letting Windows working copies show CRLF if the user prefers. `.bat`, `.cmd`, `.ps1` are explicitly CRLF (Windows shells require it). Binary patterns are marked to prevent diff corruption.

## Acceptance criteria

- [x] `.gitattributes` exists at repo root.
- [x] `* text=auto eol=lf` line present.
- [x] Explicit CRLF for `.bat`, `.cmd`, `.ps1`.
- [x] Binary markers for common image / archive types.

## Dependencies

- Blocked by: TASK-001

## Activity log

- 2026-04-25 — created
- 2026-04-25 — done
