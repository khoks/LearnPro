---
id: STORY-002
title: Capture raw vision + groomed feature catalog + recommended additions
type: story
status: done
priority: P0
estimate: M
parent: EPIC-001
phase: scaffolding
tags: [docs, vision, grooming]
created: 2026-04-25
updated: 2026-04-25
---

## Description

The user delivered the LearnPro vision in a single brain-dump message. We need three durable artifacts in `docs/vision/`:

1. **`RAW_VISION.md`** — the user's words verbatim, untouched. This is the source of truth for "what was the original intent." Every later interpretation can be diffed against it.
2. **`GROOMED_FEATURES.md`** — the vision exploded into 11 themes, each with concrete feature lists tagged MVP / v1 / v2 / v3. This is what we groom *from*; the raw vision is what we groom *of*.
3. **`RECOMMENDED_ADDITIONS.md`** — gap analysis. Things the user did not mention but the platform needs (FSRS spaced repetition, hint-laddering with XP cost, anti-cheat, debugging exercises, GitHub portfolio push, GDPR export, accessibility baseline, etc.).

Together they convert "huge ambitious vision" into "concrete buckets we can prioritize against."

## Acceptance criteria

- [x] `docs/vision/RAW_VISION.md` matches the user's original input exactly (zero edits to the original prose; addenda recording later clarifications are appended below, clearly delimited).
- [x] `docs/vision/GROOMED_FEATURES.md` lists all 11 themes, each with a feature table tagged MVP/v1/v2/v3.
- [x] `docs/vision/RECOMMENDED_ADDITIONS.md` covers at least: spaced repetition, hint laddering, knowledge graph, anti-cheat, debugging exercises, "read this code" exercises, GitHub portfolio, cheatsheets, telemetry/eval, GDPR export, accessibility, Pomodoro.
- [x] Each recommended addition has a stated rationale and target phase (MVP/v1/v2/v3).

## Dependencies

- Blocks: STORY-003 (architecture is informed by which features are in scope).
- Blocked by: STORY-001 (repo must exist).

## Tasks

- [TASK-008](../tasks/TASK-008-raw-vision.md) — Save raw vision verbatim
- [TASK-009](../tasks/TASK-009-groomed-features.md) — Author groomed feature catalog
- [TASK-010](../tasks/TASK-010-recommended-additions.md) — Author gap analysis

## Activity log

- 2026-04-25 — created
- 2026-04-25 — set to in-progress; all 3 child tasks completed during day-1 session
- 2026-04-25 — done (closed with the initial commit)
