# Decisions log

> Running log of cross-cutting product and engineering judgment calls that don't warrant a full ADR. Maintained by the [`harvest-knowledge`](../../.claude/skills/harvest-knowledge/SKILL.md) skill at the end of each relevant session. Newest entries on top.
>
> **For full ADRs** (architecture-shape decisions) see [`docs/architecture/`](../architecture/) and the narrow-ADR overflow in this folder ([README](./README.md)).
>
> **Entry format:** see the bottom of this file.

---

## 2026-04-25 — Auto-trigger work-tracking and harvest-knowledge via Stop hook

**Context:** The user wants the project's vision/architecture/decisions docs and the JIRA-style Epic/Story/Task system kept up-to-date *automatically* after every conversation, without relying on memory or manual prompts. Skills cannot self-invoke in Claude Code.

**Decision:** Use a project-scoped `Stop` hook in `.claude/settings.json` that blocks session-end on the first attempt and instructs Claude to run `harvest-knowledge` then `work-tracking` before stopping. The block is gated by a per-session marker file (`.claude/state/housekept-<session_id>`) and `stop_hook_active` to avoid loops.

**Alternatives considered:**
- `SessionEnd` hook — fires *after* Claude has stopped; can't drive Claude back into action. Rejected.
- Daily cron / scheduled task — runs outside the session, can't see the conversation. Rejected.
- Memory entry only — memory cannot trigger automated behavior; relies on Claude voluntarily complying. Rejected.

**Consequences:**
- (+) Every meaningful session ends with both skills sweeping the conversation. Docs and BOARD stay coherent without user intervention.
- (+) Skip-and-say-so escape hatch keeps tactical sessions cheap.
- (−) The settings watcher caveat: hooks added mid-session may not be live until the user opens `/hooks` once (or restarts Claude Code). User has been told.
- (−) Marker files in `.claude/state/` accumulate over time. Gitignored, low cost, can be wiped manually.

**Owner:** user (Rahul) — confirmed approach 2026-04-25
**Related:** [`.claude/settings.json`](../../.claude/settings.json), [`.claude/hooks/post-session-housekeeping.sh`](../../.claude/hooks/post-session-housekeeping.sh), `harvest-knowledge` skill, `work-tracking` skill, STORY-051 (filing this work).

---

## Entry format

Newest entries go at the top of the list above. Use this template:

```markdown
## YYYY-MM-DD — <one-line decision (lead with the verb / outcome)>

**Context:** what prompted this — a constraint, an incident, a discussion
**Decision:** what we picked
**Alternatives considered:** what we didn't pick and why (terse)
**Consequences:** (+) wins / (−) costs we accepted
**Owner:** who decided (usually the user)
**Related:** ADR-NNNN, STORY-NNN, file:line, prior log entry, etc.
```

Keep entries short. If you find yourself writing more than a screen, it's probably an ADR.
