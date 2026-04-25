---
id: TASK-017
title: Empty-folder README stubs + initial git commit
type: task
status: done
priority: P0
estimate: S
parent: STORY-004
epic: EPIC-001
phase: scaffolding
tags: [folders, git, commit, scaffolding]
created: 2026-04-25
updated: 2026-04-25
---

## Description

Create the otherwise-empty folders the MVP build will need (`apps/`, `packages/`, `infra/docker/`, `infra/scripts/`, `scripts/{windows,mac,linux}/`, `.github/workflows/`, `.vscode/`, `docs/decisions/`), each with a `README.md` stub explaining intent. This way `git` actually tracks them and a fresh clone shows the intended structure.

Then make the initial commit:

```
chore: initial scaffolding (vision, architecture, roadmap, project tracking)

- Vision docs: RAW_VISION + GROOMED_FEATURES + RECOMMENDED_ADDITIONS
- Architecture: ARCHITECTURE.md + 5 ADRs (monorepo, sandbox, llm-provider, database, license)
- Roadmap: MVP.md + ROADMAP.md
- Project tracking: BOARD, README, 3 templates, 16 epics, 27 stories, 17 tasks (all day-1 tasks done)
- Hygiene: .gitignore, .gitattributes, .editorconfig, .nvmrc, .env.example, LICENSE (BSL 1.1), README, CLAUDE.md
- Folder structure: apps/, packages/, infra/, scripts/{windows,mac,linux}/, .github/, .vscode/, docs/decisions/

Closes EPIC-001 STORY-001..STORY-004 TASK-001..TASK-017.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

No remote push yet — that's the user's call.

## Acceptance criteria

- [x] All listed empty folders exist with README.md stubs.
- [x] `git status` shows zero untracked files after the commit.
- [x] Initial commit message follows the format above.
- [x] No remote configured (user adds one when ready).

## Dependencies

- Blocked by: TASK-016

## Activity log

- 2026-04-25 — created
- 2026-04-25 — done
