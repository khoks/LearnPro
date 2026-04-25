---
id: STORY-004
title: Stand up in-repo Epic/Story/Task tracking system
type: story
status: done
priority: P0
estimate: M
parent: EPIC-001
phase: scaffolding
tags: [tracking, jira, project-management, dogfooding]
created: 2026-04-25
updated: 2026-04-25
---

## Description

The user explicitly required that the plan and ongoing scope evolution live **in the repo**, not in chat history — classic JIRA hierarchy (Epics → Stories → Tasks) tracked as markdown files with YAML frontmatter, with `BOARD.md` as the live status table. This story stands that system up *and* uses it to track its own creation (eat our own dog food from minute one).

When this story closes, anyone (or any future Claude Code session) can:
- `cat project/BOARD.md` to see what's done, in progress, and pending.
- Read `project/README.md` to learn the conventions (status states, priority levels, estimate sizes, lifecycle rules).
- Copy a template from `project/TEMPLATES/` to create a new Epic/Story/Task.
- `grep -r "status: in-progress" project/` to find current work.

The day-1 pre-population covers all 16 Epics (so the strategic shape is locked), the EPIC-001 stories + a full MVP backlog of stories (so we know what's next), and **all 17 day-1 scaffolding tasks marked `done`** (because executing the plan = completing them).

## Acceptance criteria

- [x] `project/README.md` documents hierarchy, ID conventions, frontmatter spec, status states, lifecycle rules, and find-things-fast grep examples.
- [x] `project/TEMPLATES/{EPIC,STORY,TASK}.md` exist and are usable copy-paste templates.
- [x] All 16 Epic files exist in `project/epics/` with correct frontmatter and meaningful Goal/Scope/Exit-criteria sections.
- [x] At least 25 Story files exist in `project/stories/` covering EPIC-001 (4 stories, in-progress) and the MVP backlog (~23 stories, status `backlog`).
- [x] All 17 day-1 scaffolding Tasks exist in `project/tasks/` and are marked `status: done`.
- [x] `project/BOARD.md` accurately reflects the current state (4 stories in-progress, 23+ MVP stories in backlog, 17 tasks done).
- [x] `CLAUDE.md` instructs future sessions that `project/BOARD.md` is the source of truth, not chat history.

## Dependencies

- Blocks: (nothing — this is the last EPIC-001 story; closing it closes the epic.)
- Blocked by: STORY-001, STORY-002, STORY-003 (the tracking system reflects what those produced).

## Tasks

- [TASK-014](../tasks/TASK-014-tracking-readme-and-templates.md) — Author `project/README.md` + 3 templates
- [TASK-015](../tasks/TASK-015-write-16-epics.md) — Pre-populate all 16 Epic files
- [TASK-016](../tasks/TASK-016-write-board-and-stories.md) — Pre-populate `BOARD.md`, ~27 Stories, 17 Tasks
- [TASK-017](../tasks/TASK-017-folder-stubs-and-commit.md) — Empty-folder README stubs + initial git commit

## Activity log

- 2026-04-25 — created
- 2026-04-25 — set to in-progress; child tasks 14–16 complete; TASK-017 in flight
- 2026-04-25 — done (closed with the initial commit; all 4 child tasks done)
