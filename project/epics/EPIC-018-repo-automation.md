---
id: EPIC-018
title: Repo automation & Claude Code skills
type: epic
status: in-progress
priority: P1
phase: scaffolding
tags: [automation, claude-code, skills, hooks, dx]
created: 2026-04-25
updated: 2026-04-25
---

## Goal

Make the repo *self-maintaining* across Claude Code sessions. Vision/architecture/decisions docs and the Epic/Story/Task system should stay coherent without the user having to remember to update them. Achieved via project-scoped Claude Code skills and hooks that run automatically at well-defined points in the session lifecycle.

## Scope

- **Project skills** under `.claude/skills/` that codify repo-specific operational tasks (knowledge harvesting, work tracking, future: prompt-eval scaffolding, commit-message suggestion, etc.).
- **Hooks** in `.claude/settings.json` that auto-trigger those skills at the right lifecycle events (Stop, PostToolUse, etc.).
- **Supporting infra**: marker files, gitignore entries, CLAUDE.md pointers, README pointers.
- **Skill discipline**: each skill has a clear scope, a clear when-to-skip rule, and stays out of code-implementation work.

## Out of scope

- Skills that wrap MVP application code (those live in the MVP epics).
- CI/CD pipelines (those land in EPIC-015 SaaS readiness).
- IDE-specific tooling (.vscode/ etc. — handled per-developer, not project-wide).

## Stories under this Epic

- [STORY-051](../stories/STORY-051-claude-skills-and-stop-hook.md) — `harvest-knowledge` + `work-tracking` skills + Stop hook (in-progress)

## Exit criteria

- [ ] At least the two foundational skills (`harvest-knowledge`, `work-tracking`) shipped and working.
- [ ] Stop hook auto-triggers them at the end of every session.
- [ ] CLAUDE.md documents the auto-housekeeping flow.
- [ ] `.gitignore` excludes session-local state.
- [ ] No breakage to existing repo conventions.

## Related

- [`.claude/settings.json`](../../.claude/settings.json)
- [`.claude/hooks/post-session-housekeeping.sh`](../../.claude/hooks/post-session-housekeeping.sh)
- [`.claude/skills/harvest-knowledge/SKILL.md`](../../.claude/skills/harvest-knowledge/SKILL.md)
- [`.claude/skills/work-tracking/SKILL.md`](../../.claude/skills/work-tracking/SKILL.md)
- [`docs/decisions/DECISIONS_LOG.md`](../../docs/decisions/DECISIONS_LOG.md) — the 2026-04-25 entry that records this design choice.

## Activity log

- 2026-04-25 — created. STORY-051 in-progress.
