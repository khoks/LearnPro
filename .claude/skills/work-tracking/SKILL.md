---
name: work-tracking
description: Maintain the in-repo JIRA-style work tracking system (Epics → Stories → Tasks under project/) and the live BOARD.md. Sweep the conversation for new requirements, scope changes, blockers, and status transitions; create new items where needed; update statuses with activity-log entries; refresh project/BOARD.md. Run near the end of any session that touched scope, requirements, or item status — the Stop hook will remind you. Skip-and-say-so if nothing changed.
---

# work-tracking

This skill keeps the project's Epic/Story/Task system synchronized with what actually happened (or got proposed) in the conversation. It runs after `harvest-knowledge` near the end of each session.

The conventions, ID format, frontmatter format, and lifecycle rules are documented in [`project/README.md`](../../../project/README.md). Templates live in [`project/TEMPLATES/`](../../../project/TEMPLATES/). Re-read those if you're unsure — this SKILL.md is the *operational checklist*, the README is the *source of truth* for conventions.

## When to skip

If the session was purely tactical and changed no scope or status, say so explicitly:

> work-tracking: no scope or status changes this session.

Then mark the session housekept (per the hook's instructions) and move on. **Do not invent work items.**

## What to look for

Scan the conversation for any of these signals. Each one corresponds to one or more concrete actions on `project/`.

| Signal | Action |
|---|---|
| User said "let's also add…" or "we should…" or harvest-knowledge flagged a backlog item | **Create a new STORY** under the relevant Epic with `status: backlog`. If it doesn't fit any existing epic, create a new EPIC first. |
| User picked up a Story or Task and started work | Set `status: in-progress`, append `YYYY-MM-DD — picked up` to activity log. |
| Work on an item completed | Check off ACs, set `status: done`, append `YYYY-MM-DD — done` (with a one-line summary), update BOARD. |
| User cancelled scope | Set `status: canceled`, add a one-line reason to activity log. |
| User reported a blocker | Set `status: blocked`, append the blocker reason to activity log. Add a row in BOARD's `## Blocked` section. |
| New Epic-level theme emerged | Create a new EPIC file (next free `EPIC-NNN`), seed with goal / scope / out-of-scope / exit criteria; add to BOARD's Epic index. |
| MVP scope changed | Update `docs/roadmap/MVP.md` AND adjust the affected Stories' `phase:` field. Flag this loudly in your handoff. |

## Conventions (recap from project/README.md)

- **IDs** are flat with prefixes: `EPIC-NNN`, `STORY-NNN`, `TASK-NNN`. Find the next free number by listing the corresponding folder. Numbers are never reused.
- **Frontmatter is required** on every item: `id`, `title`, `type`, `status`, `priority`, `estimate` (for stories/tasks), `parent` (for stories/tasks), `phase`, `tags`, `created`, `updated`. Bump `updated:` on every change.
- **Status values:** `backlog` | `todo` | `in-progress` | `review` | `done` | `blocked` | `canceled`.
- **Estimates:** `XS` (<1h) | `S` (<4h) | `M` (<1d) | `L` (<3d) | `XL` (>3d).
- **Priority:** `P0` | `P1` | `P2` | `P3`.
- **Phase:** `scaffolding` | `mvp` | `v1` | `v2` | `v3`.
- **Activity log** is a markdown bullet list at the bottom of each item; append a new dated bullet for every status change with a one-line summary of what happened.
- **Commit style:** `<type>(<scope>): <subject> [STORY-NNN]` (or `[TASK-NNN]`). One commit per meaningful change so `git log -- project/` is a real audit trail. Always reference an ID.

## Process (what to do, in order)

1. **Read `project/BOARD.md`** to anchor on current state. Note the In Progress / Up Next / Backlog sections.
2. **Run harvest-knowledge first** if it hasn't run yet — it may flag new ideas worth filing as Stories.
3. **Scan the conversation** for the signals above. Aggregate into: { items to create, items to update, BOARD changes }.
4. **Discipline gate for new Stories** (per the EPIC-017 Phase C precedent): only file an idea as a Story if (a) it reinforces a differentiator, (b) someone could start work on it in the planned phase, and (c) it's specific enough to estimate today. Otherwise it stays in `RECOMMENDED_ADDITIONS.md` only.
5. **Create new items**: copy the matching template from `project/TEMPLATES/`, give it the next free ID, fill the frontmatter, write Description / Acceptance criteria (testable bullets) / Dependencies / Notes / Activity log.
6. **Update existing items**: edit frontmatter (`status`, `updated`), check off ACs that completed, append activity-log entries. Don't rewrite history — append.
7. **Update `project/BOARD.md`**: move rows between sections (In Progress / Up Next / Backlog / Recently Done / Blocked / Canceled), update the Epic index status column, bump the `Last updated:` line.
8. **Cross-link** new Stories to the harvest-knowledge entries that motivated them (RECOMMENDED_ADDITIONS row, NOVEL_IDEAS entry, ADR, DECISIONS_LOG entry).
9. **Report** in 2–5 lines what you created/updated and what's now `In Progress` / `Up Next`. Suggest the commit subject if the user is committing.

## Where new Epics live

The current Epic numbering goes up to `EPIC-017` (closed). Open numbering for new Epics: `EPIC-018+`. Likely candidates the user has hinted at:
- `EPIC-018` — Project automation & Claude Code skills (this skill, the harvest skill, the Stop hook).
- `EPIC-019` — Mock interviewer (if v2 mock-interview scope grows beyond [STORY-047](../../../project/stories/STORY-047-mock-interviewer-agent.md)).
- `EPIC-020` — Project-based learning (if v2 project scope grows beyond [STORY-048](../../../project/stories/STORY-048-project-based-learning.md)).

Don't create these speculatively — only when the user actually adds scope that warrants them.

## What NOT to do

- Do **not** mass-rewrite items. Edits should be surgical (frontmatter line + AC checkbox + appended log line).
- Do **not** re-number existing items. IDs are immutable.
- Do **not** mark a Story `done` if any Acceptance Criterion isn't checked off — either check it off (with justification in the log) or leave the Story `in-progress`.
- Do **not** create Tasks speculatively. Tasks are concrete implementation steps. Stories aren't decomposed into Tasks until they're picked up.
- Do **not** delete items. Use `status: canceled` with a one-line reason in the activity log.
- Do **not** commit. Leave staged changes for the user to bundle with code + harvest-knowledge output in one Conventional Commit.

## Boundary with harvest-knowledge

`harvest-knowledge` writes **prose docs** (vision, architecture, decisions, novel ideas). `work-tracking` writes **structured items** (Epics, Stories, Tasks, BOARD). Run harvest-knowledge **first**, then work-tracking — work-tracking may need to consume harvest-knowledge's output (e.g., a newly-flagged idea in `RECOMMENDED_ADDITIONS.md` that should also be filed as a Story).
