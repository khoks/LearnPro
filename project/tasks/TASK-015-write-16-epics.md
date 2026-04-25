---
id: TASK-015
title: Pre-populate all 16 Epic files
type: task
status: done
priority: P0
estimate: M
parent: STORY-004
epic: EPIC-001
phase: scaffolding
tags: [tracking, epics]
created: 2026-04-25
updated: 2026-04-25
---

## Description

One markdown file per Epic in `project/epics/`, with full frontmatter and Goal / Scope (MVP, v1, v2+) / Out-of-scope / Stories / Exit-criteria / Related / Activity-log sections:

- EPIC-001 — Repository initialization & scaffolding (status: in-progress)
- EPIC-002 — MVP single learning loop
- EPIC-003 — Containerized code sandbox
- EPIC-004 — Tutor agent harness
- EPIC-005 — Learner profile & episodic memory
- EPIC-006 — Multi-horizon planning
- EPIC-007 — Adaptive problem generation & grading
- EPIC-008 — Voice tutor (deferred to v1)
- EPIC-009 — Learning tracks
- EPIC-010 — Career-aware curriculum
- EPIC-011 — Gamification (no dark patterns)
- EPIC-012 — Notifications
- EPIC-013 — Cross-platform
- EPIC-014 — RAG / agent memory
- EPIC-015 — SaaS readiness primitives
- EPIC-016 — Security & anti-cheat

## Acceptance criteria

- [x] All 16 Epic files exist with correct frontmatter (id, title, type=epic, status, priority, phase, tags, dates).
- [x] Each has substantive Goal/Scope/Exit-criteria sections (not just headers).
- [x] EPIC-001 marked `in-progress`; the rest `backlog`.

## Dependencies

- Blocked by: TASK-014

## Activity log

- 2026-04-25 — created
- 2026-04-25 — done
