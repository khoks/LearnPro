---
id: STORY-051
title: harvest-knowledge + work-tracking skills, auto-triggered by a Stop hook
type: story
status: in-progress
priority: P1
estimate: M
parent: EPIC-018
phase: scaffolding
tags: [automation, claude-code, skills, hooks]
created: 2026-04-25
updated: 2026-04-25
---

## Description

As a solo dev playing both PM and engineer, I want the repo's documentation and the Epic/Story/Task tracking system to stay current automatically — so that future sessions (mine or Claude's) can pick up without losing context, and so that I never have to remember to "write down what we just decided."

The mechanism is two project-scoped Claude Code skills plus a `Stop` hook that runs them before any session can end. Skills cannot self-invoke in Claude Code; the Stop hook is the closest possible auto-trigger.

## Acceptance criteria

- [x] `.claude/skills/harvest-knowledge/SKILL.md` written, with a clear what-to-extract / where-to-write / when-to-skip spec.
- [x] `.claude/skills/work-tracking/SKILL.md` written, with the lifecycle / template / BOARD-update playbook.
- [x] `.claude/hooks/post-session-housekeeping.sh` written, pipe-tested in three modes (fresh / stop_hook_active=true / marker present), produces valid JSON output.
- [x] `.claude/settings.json` registers the Stop hook (committed to repo, not local).
- [x] `docs/decisions/DECISIONS_LOG.md` and `docs/vision/NOVEL_IDEAS.md` seeded with templates + the first decision entry.
- [x] `.gitignore` updated to exclude `.claude/state/`, `.claude/settings.local.json`, `.claude/memory/`.
- [x] `CLAUDE.md` updated to point new sessions at the auto-housekeeping flow.
- [ ] First real run of the hook end-to-end (will happen at the end of *this* session — the hook will block stop, this assistant will run both skills, and verify the marker mechanism releases the block).

## Tasks under this Story

(Tasks will be created if/when this Story is decomposed further. Current scope is small enough to track at the Story level.)

## Dependencies

- Blocked by: none.
- Blocks: nothing critical, but every future session benefits.

## Notes

- The `/hooks` watcher caveat: settings.json changes mid-session may not be live until the user opens `/hooks` once or restarts Claude Code. User has been told.
- Marker files at `.claude/state/housekept-<session_id>` are gitignored and accumulate harmlessly. Wipe with `rm -rf .claude/state/` if desired.
- Open question (parked): whether to add a `PreCompact` hook so the same housekeeping happens before context compaction, not only at session end. Defer until we see whether long sessions actually need it.
- Decision recorded in [`docs/decisions/DECISIONS_LOG.md`](../../docs/decisions/DECISIONS_LOG.md) (2026-04-25 entry).

## Activity log

- 2026-04-25 — created; in-progress
- 2026-04-25 — skills + hook + settings + supporting docs all written and pipe-tested. Final AC (live hook end-to-end) will close at session end.
