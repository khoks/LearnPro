---
id: STORY-006
title: Monaco editor + run button + result panel
type: story
status: backlog
priority: P0
estimate: M
parent: EPIC-003
phase: mvp
tags: [editor, monaco, ui]
created: 2026-04-25
updated: 2026-04-25
---

## Description

The user-facing surface of the sandbox. Monaco editor (the same engine that powers VS Code — leverages users' existing muscle memory) embedded in the problem page, with a **Run** button that streams stdout/stderr into a result panel beneath, plus a **Submit** button that runs against hidden tests and surfaces pass/fail per case.

Includes language switching (Python/TS at MVP), syntax highlighting, basic IntelliSense, theme matching the app, and a sensible default font/size that respects the user's accessibility preferences.

## Acceptance criteria

- [ ] Monaco loads in <500ms on a warm cache.
- [ ] Run button streams stdout/stderr live (not just final output) via the `/realtime` WebSocket.
- [ ] Submit button runs hidden tests and renders a per-case pass/fail table with diffs on failure.
- [ ] Editor language mode follows the problem language (no manual switching).
- [ ] Editor is keyboard-navigable; tab traps inside the editor and Esc/Shift+F10 exit it (accessibility baseline).

## Dependencies

- Blocked by: STORY-007 (Python runner) or STORY-008 (TS runner) for end-to-end verification.

## Tasks

(To be created when work begins.)

## Activity log

- 2026-04-25 — created
