---
name: harvest-knowledge
description: Extract vision, feature ideas, architectural / scaling / infrastructure / tech-stack decisions, novel or patentable ideas, and crucial product or engineering decisions from the current conversation, then persist them into the right project docs (RECOMMENDED_ADDITIONS, ARCHITECTURE / ADRs, DECISIONS_LOG, NOVEL_IDEAS). Run this near the end of any session that touched product, architecture, or decisions — the Stop hook will remind you. Skip-and-say-so if the conversation introduced nothing new worth persisting.
---

# harvest-knowledge

This skill is the project's institutional memory. It runs at the end of (almost) every session and writes down anything new the conversation produced so a future session — Claude or human — can pick up without losing context.

The Stop hook (`.claude/hooks/post-session-housekeeping.sh`) auto-invokes it. You can also call it manually mid-session if a long discussion just ended.

## When to skip

If the conversation was purely tactical — fixing a bug, running tests, reading code, no new ideas or decisions — say so explicitly in your handoff:

> harvest-knowledge: nothing new to persist this session. Conversation was [one-line summary].

Then mark the session housekept (per the hook's instructions) and move on. **Do not invent things to write down.**

## What to look for

Scan the user's messages and your own responses for these five categories. A single sentence can belong to multiple categories — that's fine; persist it in each relevant place.

| Category | Examples | Destination |
|---|---|---|
| **Feature idea / vision item** | "We should also let users…", "what if the tutor could…", "in v2 maybe…" | `docs/vision/RECOMMENDED_ADDITIONS.md` (append to relevant epic section, mark `Filed?` column) |
| **Architecture / perf / scaling / infra / tech-stack** | library swap, schema change, scaling concern, new adapter, deployment topology, security model | `docs/architecture/ARCHITECTURE.md` if minor, or a **new ADR** `docs/architecture/ADR-NNNN-<slug>.md` if it changes a locked decision |
| **Product / engineering decision** | "we'll use X over Y because…", "we're going to defer Z", "MVP scope now includes…", commit-style judgment calls | `docs/decisions/DECISIONS_LOG.md` (append a dated entry) |
| **Novel / patentable idea** | a mechanism the user thinks is genuinely new (e.g., a new tutor pedagogy loop, a new scoring formula, a workflow that doesn't exist elsewhere) | `docs/vision/NOVEL_IDEAS.md` (append a dated entry with rationale and prior-art note) |
| **Recommended-additions backlog drift** | the conversation suggests an item already in `RECOMMENDED_ADDITIONS.md` but with new detail or rationale | Update that item in place (don't duplicate) |

## File-update patterns

### `docs/vision/RECOMMENDED_ADDITIONS.md`
This is a 100+-idea catalog organized by epic. Each idea is a table row or bullet with: **Description • Rationale • Phase (mvp/v1/v2/v3) • Filed?**. When you add an idea:
1. Find the relevant epic section (or create one).
2. Append a new row/bullet.
3. If the idea is concrete enough for the user to start in v1/v2 (a) reinforces a differentiator and (b) is specific enough to estimate, also flag it for the **work-tracking** skill to file as a Story.

### `docs/architecture/ADR-NNNN-<slug>.md`
Use the existing ADR pattern (status / context / decision / consequences). Find the next free `NNNN` by listing `docs/architecture/`. Keep ADRs short — 1–2 paragraphs each section. Update `docs/architecture/ARCHITECTURE.md` if the decision changes a locked choice.

### `docs/decisions/DECISIONS_LOG.md`
Running chronological log. Each entry:

```markdown
## 2026-MM-DD — <one-line decision>

**Context:** what prompted this
**Decision:** what we picked
**Alternatives considered:** what we didn't pick and why
**Owner:** who decided (usually the user)
**Related:** ADR-XXXX, STORY-YYY, file:line, etc.
```

Use this for *product* and *cross-cutting engineering* decisions that don't warrant a full ADR but matter for future-you to remember the *why*.

### `docs/vision/NOVEL_IDEAS.md`
Reserved for things the user explicitly flags as novel, or that you genuinely have not seen documented elsewhere in the public adaptive-learning / agentic-tutor space. Each entry:

```markdown
## 2026-MM-DD — <name of the idea>

**What it is:** 2–3 sentences
**Why it might be novel:** what existing approaches do differently; cite competitors / prior art if you know any
**Patentability signal:** plain-language note on whether this looks like a method/process/system claim worth a deeper patent search; never legal advice
**Where it lives in the product:** epic/story link
**Open questions:** what would need to be true for this to actually work
```

Be honest about novelty. If a five-second mental search turns up an obvious prior-art match, write that down — false patent flags waste real money.

## Process (what to do, in order)

1. **Read** `docs/vision/RECOMMENDED_ADDITIONS.md`, `docs/decisions/DECISIONS_LOG.md`, `docs/vision/NOVEL_IDEAS.md` if you don't already know their current state. Glance at `docs/architecture/` to see the ADR numbering.
2. **Scan the conversation** for the five categories above. Aggregate into a mental list.
3. **Dedupe against existing docs** — for each candidate, check whether it (or a near-equivalent) is already written down. If yes, update in place rather than appending a duplicate.
4. **Write the updates** in a small number of `Edit`/`Write` calls (don't make 30 micro-edits to one file — batch).
5. **Cross-link** new entries: ADR ↔ DECISIONS_LOG ↔ STORY ↔ NOVEL_IDEAS where relevant.
6. **Report** in 2–4 lines what you persisted and where. List affected files. If a decision deserves its own commit (per the project's commit-style rules) and the user is committing, suggest the commit subject.

## What NOT to do

- Do **not** re-summarize the whole session into a new doc. The skill is for atomic, durable knowledge — not session journals.
- Do **not** create new doc directories outside the four destinations above without asking.
- Do **not** copy code snippets into docs — link to file:line instead.
- Do **not** invent decisions the user did not make. If you're guessing, say "PROPOSED:" in the entry and ask the user to confirm next session.
- Do **not** commit. Leave the staged changes for the user to review (they may want to bundle with the work-tracking skill's output and any session code in one commit, with a proper Conventional Commit message).

## Boundary with work-tracking

`harvest-knowledge` writes **prose docs**. `work-tracking` writes **Epic/Story/Task files + BOARD.md**. Overlap rule:
- A *new feature idea* worth filing as a Story → harvest-knowledge adds it to `RECOMMENDED_ADDITIONS.md`, then **flags** it for work-tracking. Work-tracking actually creates the STORY file.
- A *decision* affecting an existing Epic/Story scope → harvest-knowledge logs the decision; work-tracking updates the affected items.

Run harvest-knowledge first, then work-tracking. The order matters because work-tracking may consume harvest-knowledge's output.
