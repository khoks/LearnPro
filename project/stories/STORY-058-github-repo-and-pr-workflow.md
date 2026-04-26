---
id: STORY-058
title: GitHub repo bootstrap + PR-based workflow conventions
type: story
status: done
priority: P1
estimate: S
parent: EPIC-018
phase: scaffolding
tags: [automation, github, dx, workflow]
created: 2026-04-25
updated: 2026-04-25
---

## Description

The repo needed to live on GitHub (under [`khoks`](https://github.com/khoks)) so that:

- Work going forward lands as **per-Story PRs into `main`** (one branch per Story, e.g. `story/052-monorepo-skeleton`).
- The PR is the unit of review-and-record, not loose commits to `main`.
- Branch protection enforces the workflow even when the assistant slips up (no direct pushes to `main`, no force-pushes, linear history).
- The user can audit anything that landed by reading the PR list, not by trawling commit messages.

The user has authorized **assistant-self-merge** ("I trust your PRs") *after* design/requirement/algorithm/tech-stack alignment happens conversationally upfront. So branch protection requires PR but **not** an approving review.

## Acceptance criteria

- [x] Public GitHub repo created at [`khoks/LearnPro`](https://github.com/khoks/LearnPro) with the BSL-1.1-aligned description.
- [x] All existing local commits pushed to `origin/main`.
- [x] Discoverability topics added (education, ai, claude, self-hosted, learning-platform, learn-to-code, typescript, nextjs).
- [x] Branch protection on `main`: PR required, 0 reviews needed, linear history, no force-push, no deletion.
- [x] [`.github/PULL_REQUEST_TEMPLATE.md`](../../.github/PULL_REQUEST_TEMPLATE.md) — references the in-repo Story system and the BOARD update gate.
- [x] [`.github/CODEOWNERS`](../../.github/CODEOWNERS) — `@khoks` owns everything for now.
- [x] First end-to-end PR (this one) successfully opens and self-merges, proving the workflow.

## Tasks under this Story

(Small enough to track at the Story level.)

## Dependencies

- Blocked by: none.
- Blocks: every future code Story (they need a place to land PRs).

## Notes

- Branch-protection JSON had to be applied via `gh api` (not `gh repo edit`) and **without** a leading slash on the endpoint path — Git Bash on Windows otherwise rewrites `/repos/...` into a Windows filesystem path.
- `enforce_admins: false` is intentional: the repo owner (`@khoks`) can override the branch-protection rules in a real emergency without having to disable protection first.
- No CI workflow yet. A stub Actions workflow (lint + typecheck + unit tests) will land alongside the first real code Story (likely STORY-052 monorepo skeleton).
- Convention: branch names map to Story IDs — `story/NNN-kebab-slug` for Stories, `chore/<slug>` for non-Story work like this one, `fix/<slug>` for hotfixes.

## Activity log

- 2026-04-25 — created and closed in the same commit; this Story documents already-completed setup work.
