# `project/` — In-repo work tracking (Epic / Story / Task)

This folder is LearnPro's **operational source of truth** for what's done, in progress, and pending. It replaces external tools like Jira, Linear, or GitHub Issues — everything lives in the repo as markdown.

**Read [`BOARD.md`](./BOARD.md) at the start of every session.**

---

## Why in-repo tracking?

- **Self-hosted ethos.** Clone the repo and you have everything — no separate accounts or services.
- **Offline-friendly.** Works without an internet connection.
- **Diff-able.** `git log -- project/` is a real audit trail of how scope evolved.
- **AI-agent-friendly.** Future Claude Code sessions read items directly without API calls.
- **Migration path preserved.** A script can sync these markdown items to Linear / GitHub Issues later if needed.

For the rationale not to use GitHub Issues / Linear / Jira directly, see [`docs/architecture/ARCHITECTURE.md`](../docs/architecture/ARCHITECTURE.md) and the original plan at the project root.

---

## Hierarchy

Three levels, classic Jira shape:

| Level | Folder | Spans | Example |
|---|---|---|---|
| **Epic** | `epics/` | Many sprints | "Sandbox," "Tutor agent harness," "Cross-platform" |
| **Story** | `stories/` | Days to weeks; delivers value on its own | "Python code can be run in a hardened container" |
| **Task** | `tasks/` | Hours to days; concrete implementation | "Write Piston Dockerfile," "Add resource quotas" |

**Flat structure with prefixed IDs** — easier to grep and link than nested folders.

---

## ID conventions

- `EPIC-001`, `EPIC-002`, … (zero-padded to 3 digits)
- `STORY-001`, `STORY-002`, …
- `TASK-001`, `TASK-002`, …

IDs are sequential and never reused, even after deletion. Filename pattern: `{ID}-{kebab-case-slug}.md`.

To find the next free ID: `ls epics/` (or `stories/` / `tasks/`) and pick the next integer.

---

## Frontmatter format

Every item starts with YAML frontmatter:

```yaml
---
id: TASK-001                 # required
title: git init the LearnPro repo  # required
type: task                   # epic | story | task
status: todo                 # todo | in-progress | review | done | blocked | canceled
priority: P0                 # P0 | P1 | P2 | P3
estimate: XS                 # XS<1h | S<4h | M<1d | L<3d | XL>3d
parent: STORY-001            # for tasks: parent story; for stories: parent epic; epics: omit
epic: EPIC-001               # convenience denormalization (only on tasks)
phase: scaffolding           # scaffolding | mvp | v1 | v2 | v3
tags: [git, scaffolding]
created: 2026-04-25
updated: 2026-04-25
---
```

**Status values:**
- `todo` — not yet started
- `in-progress` — actively being worked on
- `review` — work done, awaiting review/verification
- `done` — completed and verified
- `blocked` — cannot progress; reason in activity log
- `canceled` — abandoned; reason in activity log

**Priorities:**
- `P0` — critical / blocker for the current phase
- `P1` — important; should land in the current phase
- `P2` — nice-to-have for the current phase
- `P3` — low priority; usually shifts to a later phase

**Phases** match the [roadmap](../docs/roadmap/ROADMAP.md):
- `scaffolding` — pre-MVP setup
- `mvp` — weeks 0–8
- `v1` — months 3–5
- `v2` — months 6–10
- `v3` — months 11+

---

## Body format

Below the frontmatter, every item has these sections (use templates in [`TEMPLATES/`](./TEMPLATES/)):

```markdown
## Description
What this is and why it exists.

## Acceptance criteria
- [ ] Bullet list of testable conditions

## Dependencies
- Blocks: TASK-002, TASK-003
- Blocked by: (none)

## Activity log
- 2026-04-25 — created
- 2026-04-26 — picked up; status → in-progress
- 2026-04-26 — done
```

---

## Lifecycle rules

1. **Creating an item:**
   - Copy the relevant template from `TEMPLATES/`.
   - Pick the next free ID (see above).
   - Save as `{ID}-{slug}.md` in the right folder.
   - Fill frontmatter and body.
   - Append a row to `BOARD.md` in the appropriate section.

2. **Status transitions:**
   - `todo → in-progress → review → done` (review is optional for solo work).
   - `blocked` from any state, with a one-line reason in the activity log.
   - `canceled` from any state, with a reason.
   - **Every status change appends a line to the item's activity log AND updates `BOARD.md`. Bumps `updated:` field.**

3. **Commits:**
   - One commit per meaningful change so `git log -- project/` is a real audit trail.
   - **Commit messages reference IDs:** `chore(project): mark TASK-007 done` or `feat(sandbox): wire piston runner [TASK-042]`.

4. **Scope changes from future discussions:**
   - New requirement → new Story (or revised existing Story).
   - Cancelled scope → set `status: canceled` with reason.
   - Plan documents in `docs/` are updated when meaningful scope shifts; `project/` is the operational truth for individual items.

---

## How to find things fast

```bash
# All in-progress items
grep -l "status: in-progress" project/{epics,stories,tasks}/*.md

# Everything tagged "sandbox"
grep -l "tags:.*sandbox" project/{epics,stories,tasks}/*.md

# All MVP work
grep -l "phase: mvp" project/{epics,stories,tasks}/*.md

# Tasks blocked by a specific item
grep -l "Blocked by: TASK-042" project/tasks/*.md
```

(A v1 nice-to-have, captured as its own Story, is a script that regenerates `BOARD.md` from frontmatter automatically.)

---

## Templates

- [`TEMPLATES/EPIC.md`](./TEMPLATES/EPIC.md)
- [`TEMPLATES/STORY.md`](./TEMPLATES/STORY.md)
- [`TEMPLATES/TASK.md`](./TEMPLATES/TASK.md)
