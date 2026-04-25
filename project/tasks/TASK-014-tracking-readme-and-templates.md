---
id: TASK-014
title: Author project/README.md + EPIC/STORY/TASK templates
type: task
status: done
priority: P0
estimate: S
parent: STORY-004
epic: EPIC-001
phase: scaffolding
tags: [tracking, docs, templates]
created: 2026-04-25
updated: 2026-04-25
---

## Description

`project/README.md` documents the in-repo tracking system: hierarchy (Epic → Story → Task), ID format (`EPIC-NNN`, `STORY-NNN`, `TASK-NNN`), frontmatter spec, status states (todo / in-progress / review / done / blocked / canceled), priority levels (P0–P3), estimate sizes (XS / S / M / L / XL), lifecycle rules (status transitions, activity log, BOARD updates), find-things-fast `grep` examples, and commit-message format.

`project/TEMPLATES/{EPIC,STORY,TASK}.md` are usable copy-paste templates with full frontmatter and standard body sections.

## Acceptance criteria

- [x] `project/README.md` exists and documents all of the above.
- [x] `project/TEMPLATES/EPIC.md`, `STORY.md`, `TASK.md` all exist.
- [x] Templates have full frontmatter + standard body sections (Description / Acceptance Criteria / Dependencies / Activity Log).

## Dependencies

- Blocked by: TASK-013

## Activity log

- 2026-04-25 — created
- 2026-04-25 — done
