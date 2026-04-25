---
id: EPIC-001
title: Repo initialization, design docs, and tracking system
type: epic
status: done
priority: P0
phase: scaffolding
tags: [scaffolding, docs, tracking]
created: 2026-04-25
updated: 2026-04-25
---

## Goal

Lay the foundations: initialize the git repo, capture the user's vision permanently, write the design docs that future sessions will rely on, and stand up the in-repo tracking system that will replace session memory as the source of truth for what's done and pending.

This Epic is **purely scaffolding**. No application code lands here.

## Scope

- `git init` + standard hygiene files (`.gitignore`, `.gitattributes`, `.editorconfig`, `.nvmrc`, `.env.example`, `LICENSE`).
- Top-level `README.md` and `CLAUDE.md`.
- `docs/vision/` — verbatim raw vision, groomed feature catalog, recommended additions.
- `docs/architecture/` — `ARCHITECTURE.md` + 5 ADRs (monorepo, sandbox, LLM provider, database, license).
- `docs/roadmap/` — `MVP.md`, `ROADMAP.md`.
- `project/` — README, BOARD, TEMPLATES, all 16 Epics, ~25 initial Stories, ~17 day-1 Tasks.
- Empty folder stubs (`apps/`, `packages/`, `infra/`, `scripts/{windows,mac,linux}/`, `.github/`, `.vscode/`, `docs/decisions/`) each with a `README.md` explaining intent.
- Initial git commit.

## Out of scope

- Any application code, `package.json`, Docker images, CI workflows, source files.
- Remote git setup (`git remote add`, `git push`).
- Installing Node, Docker, or any dependency.

## Stories under this Epic

- [STORY-001](../stories/STORY-001-init-git-repo.md) — Initialize git repo with hygiene files (done)
- [STORY-002](../stories/STORY-002-write-vision-docs.md) — Capture raw vision + groomed feature catalog + recommended additions (done)
- [STORY-003](../stories/STORY-003-architecture-and-roadmap.md) — Author architecture doc, 5 ADRs, MVP scope, and phased roadmap (done)
- [STORY-004](../stories/STORY-004-stand-up-tracking.md) — Stand up in-repo Epic/Story/Task tracking system (done)

## Exit criteria

- [x] `git status` clean on `main` with one commit.
- [x] All four child Stories at `done`.
- [x] A fresh Claude Code session can answer "what is this project, where do I find X, what's pending" using only the repo's contents.

## Related

- Plan: `C:\Users\rahul\.claude\plans\ok-so-this-is-serialized-reddy.md` (the approved plan that produced this scaffolding)
- Vision: [`docs/vision/RAW_VISION.md`](../../docs/vision/RAW_VISION.md)

## Activity log

- 2026-04-25 — created; work in progress (executing the approved plan)
- 2026-04-25 — done; initial commit landed, all 4 stories closed, all 17 tasks done
