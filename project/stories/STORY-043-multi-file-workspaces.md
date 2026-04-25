---
id: STORY-043
title: Multi-file workspaces in sandbox + editor
type: story
status: backlog
priority: P0
estimate: L
parent: EPIC-003
phase: v1
tags: [sandbox, workspaces, frameworks, v1]
created: 2026-04-25
updated: 2026-04-25
---

## Description

MVP is single-file solve. v1 needs multi-file because real engineering is multi-file — and because every framework starter (React, Express, FastAPI) requires multi-file workspaces.

Add a virtual filesystem in the sandbox container, a file-tree sidebar in the UI, language-aware module/import resolution, and per-language reasonable defaults (e.g., a `package.json` for TS, a `requirements.txt` for Python).

## Acceptance criteria

- [ ] Sandbox supports multi-file workspaces (file tree persisted across runs within a session).
- [ ] Editor has a file-tree sidebar (collapsible). User can create / rename / delete files.
- [ ] Language-aware module resolution works (Python `import` across files; TS `import` across files).
- [ ] Per-language entry-point convention documented (e.g., Python: `main.py`, TS: `index.ts`).
- [ ] Hidden tests can be multi-file too (test runner unchanged; can target multi-file projects).
- [ ] Run/Submit buttons work the same way; behind the scenes, the entire workspace is snapshotted into the sandbox.
- [ ] Per-problem "starter workspace" can be defined in the problem YAML (e.g., a problem can ship a partial multi-file scaffold).

## Tasks under this Story

(To be created when this Story is picked up.)

## Dependencies

- Blocked by: EPIC-003 MVP one-shot sandbox (STORY-007/STORY-008/STORY-010).
- Enables: framework starters, project-based learning ([STORY-048](STORY-048-project-based-learning.md)).

## Notes

- Decision: stick with one-shot containers per Run (snapshot the workspace each time) for v1, OR move to long-lived per-user containers (mount the workspace as a volume). Trade-off: one-shot is simpler + safer; long-lived is faster + needs lifecycle management. Default to one-shot for v1; revisit if latency complaints.
- Catalogued in [`docs/vision/RECOMMENDED_ADDITIONS.md`](../../docs/vision/RECOMMENDED_ADDITIONS.md).

## Activity log

- 2026-04-25 — created
