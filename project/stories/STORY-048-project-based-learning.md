---
id: STORY-048
title: Project-based learning — multi-session projects with milestones
type: story
status: backlog
priority: P1
estimate: XL
parent: EPIC-007
phase: v2
tags: [content, projects, multi-session, portfolio, v2]
created: 2026-04-25
updated: 2026-04-25
---

## Description

Add a "project" content type — multi-session work with milestones (e.g., "Build a CLI todo app over 4 sessions," "Build a tiny Twitter clone over 2 weeks"). Each milestone is graded; the project produces a portfolio-grade artifact at the end.

This is what converts skill into portfolio. Pairs perfectly with [STORY-040](STORY-040-github-portfolio.md) (auto-push to GitHub).

## Acceptance criteria

- [ ] New content type: "project," distinct from "problem." Stored in `packages/problems/projects/`.
- [ ] Project schema: title, description, target track, total estimated time, ordered milestones (each: description, acceptance criteria, hint guidance, expected files/structure).
- [ ] Multi-file workspace ([STORY-043](STORY-043-multi-file-workspaces.md)) is required.
- [ ] Project state persists across sessions: workspace, current milestone, episode log.
- [ ] Per-milestone grading via tests + LLM rubric; tutor commentary calls out what's progressing well or stalling.
- [ ] At project completion: auto-push to GitHub portfolio (if user has [STORY-040](STORY-040-github-portfolio.md) connected).
- [ ] At least 3 starter projects shipped: one Python CLI tool, one TS web app, one fullstack mini-app.

## Tasks under this Story

(To be created when this Story is picked up.)

## Dependencies

- Blocked by: [STORY-043](STORY-043-multi-file-workspaces.md) (multi-file workspaces are a hard prerequisite).
- Pairs with: [STORY-040](STORY-040-github-portfolio.md).

## Notes

- Could warrant a new EPIC-019 ("Project-based learning") if scope grows. Keeping under EPIC-007 for now.
- Estimate is XL because of content effort — 3 starter projects is multi-week authoring.
- Catalogued in [`docs/vision/RECOMMENDED_ADDITIONS.md`](../../docs/vision/RECOMMENDED_ADDITIONS.md).

## Activity log

- 2026-04-25 — created
