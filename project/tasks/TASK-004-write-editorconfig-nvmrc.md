---
id: TASK-004
title: Write .editorconfig, .nvmrc, .env.example
type: task
status: done
priority: P0
estimate: XS
parent: STORY-001
epic: EPIC-001
phase: scaffolding
tags: [hygiene, editor, env]
created: 2026-04-25
updated: 2026-04-25
---

## Description

- `.editorconfig` — UTF-8, LF, 2-space indent (4 for `.py` and `.md`), trim trailing whitespace, final newline.
- `.nvmrc` — pin Node `20` (LTS).
- `.env.example` — placeholder env vars (`ANTHROPIC_API_KEY`, `DATABASE_URL`, `REDIS_URL`, `AUTH_SECRET`, `GITHUB_CLIENT_ID/SECRET`, `PISTON_URL`, `NODE_ENV`, `APP_URL`). No real values.

## Acceptance criteria

- [x] All 3 files exist at repo root.
- [x] `.nvmrc` contains exactly `20`.
- [x] `.env.example` lists every env var the MVP will consume, with empty/placeholder values.

## Dependencies

- Blocked by: TASK-001

## Activity log

- 2026-04-25 — created
- 2026-04-25 — done
