# Decisions log

> Running log of cross-cutting product and engineering judgment calls that don't warrant a full ADR. Maintained by the [`harvest-knowledge`](../../.claude/skills/harvest-knowledge/SKILL.md) skill at the end of each relevant session. Newest entries on top.
>
> **For full ADRs** (architecture-shape decisions) see [`docs/architecture/`](../architecture/) and the narrow-ADR overflow in this folder ([README](./README.md)).
>
> **Entry format:** see the bottom of this file.

---

## 2026-04-28 — Parallel agent dispatch via worktrees: brief for cap-driven mid-work termination

**Context:** Tried to pick up STORY-005 (auth), STORY-016 (seed bank), STORY-010 (sandbox hardening) in parallel by launching three `general-purpose` agents in `isolation: "worktree"` mode. All three hit a model-usage cap mid-work (the Anthropic-side daily allotment, not a project-side rate limit) and stopped before committing or pushing. STORY-010 left a fully-formed test suite in its worktree (38 tests, 13 files, hardened docker-compose) that the parent session was able to verify + ship as PR #21. STORY-016 left 33 Python YAMLs + complete Zod schema/loader/validator scaffold (no TS YAMLs, no tests) — preserved as a WIP commit on `origin/story/016-seed-problem-bank`. STORY-005 wrote substantial Auth.js + Drizzle-adapter + profile-bootstrap code into the parent worktree's working dir (worktree creation failed for that one) — preserved as a WIP commit on `origin/story/005-auth-and-profile-shell` with TODOs flagged in its body.

**Decision:** When dispatching parallel agents that each implement a meaningful Story, brief them to:
1. **Commit incrementally** (a "WIP" commit after each major section — schema, then loader, then tests — not just at the end). The harness preserves the worktree only if changes were made; nothing keeps an in-progress agent's uncommitted work safe from a cap-driven stop.
2. **Push the WIP branch to origin early** so the work is recoverable even if the local worktree is later pruned.
3. **Always check the worktree before declaring loss.** A "completed" agent task may mean "ran out of usage tokens" rather than "finished the work" — the tool result message is identical from the runtime's POV. Inspect `git worktree list` AND `git status` in the parent repo (the agent may have written outside the worktree if isolation silently failed) before re-launching.

**Alternatives considered:**
- **Sequential dispatch (one agent at a time)** — simpler bookkeeping, no cap-collapse risk, but loses the parallelism speedup that motivated the worktree pattern. Reject when budget allows parallelism; fall back to this when caps are tight.
- **Smaller per-agent scope** — break each Story into pieces small enough to finish before the cap. Works but adds Story-tracker churn (more split STORY-NNN files). Acceptable for L+/XL Stories; over-engineering for S/M.
- **Auto-resume on cap** — not currently a runtime feature. Would require an external watcher.

**Consequences:**
- (+) Future parallel batches preserve partial work even on cap collapse.
- (+) Salvageability is the default, not a recovery exercise.
- (−) Slight per-agent prompt overhead for the "commit incrementally" instructions.
- Operational follow-up: STORY-010 landed; STORY-005 + STORY-016 sit on WIP branches awaiting their next session for completion.

**Owner:** assistant — observed 2026-04-28 during the parallel-batch attempt.
**Related:** STORY-010 (the one that landed despite the cap, via main-session salvage); STORY-005 + STORY-016 WIP branches; the harness `isolation: "worktree"` semantics.

---

## 2026-04-25 — Path A: architecture-complete MVP, adaptive policies behind swappable interfaces

**Context:** During the Path A vs. Path B Q&A, the user committed to several adaptive / GenAI-driven systems for the platform: GenAI evolutionary scoring (Q1E), multi-dimensional personalized difficulty (Q2A) and skill score (Q2B), conversational adaptive onboarding (Q1B), adaptive agentic autonomy (Q1C), adaptive tutor tone (Q1G), rich interaction telemetry (Q2G). Each is bigger than the original deterministic MVP scope. Shipping all of them *live* at MVP would mean ~6 months of build with no real user data to feed any of the adaptive systems — they would behave erratically until telemetry caught up.

**Decision:** Ship MVP as **architecture-complete** but **adaptive-policy-deferred**:
- All adaptive systems get **interfaces** in MVP (`ScoringPolicy`, `TonePolicy`, `DifficultyPolicy`, `AutonomyPolicy`) — see STORY-057.
- Each interface ships with a **deterministic default implementation** (e.g., difficulty = ELO + EWMA, tone = warm-coach default, autonomy = always-confirm).
- Each interface ships with the **operator-injectable rules slot** so the policy is config-driven on day 1.
- The **rich data-capture schema** (telemetry, profile dimensions) is **MVP-critical** — much cheaper to capture rich data from day 1 than retrofit later (STORY-055).
- The **GenAI implementations** of each policy ship as v1 work — once telemetry is feeding them.
- Conversational onboarding (STORY-053) is treated separately from auth / profile-shell (STORY-005); STORY-005 reduced to auth + bootstrap.

**Alternatives considered:**
- **Path B (full-adaptive MVP)** — Ship GenAI scoring / difficulty / tone / autonomy / onboarding all live at MVP. Real risk of erratic behavior in the cold-start window before telemetry catches up; high failure mode. Rejected.
- **Defer adaptive interfaces entirely to v1** — Ship a fully deterministic MVP without the policy-adapter pattern. Cheaper short-term, but every adaptive feature in v1 becomes a refactor rather than a config flip. Rejected — the interface cost in MVP is small, the v1 dividend is large.

**Consequences:**
- (+) MVP is testable end-to-end with deterministic policies; honest about what's adaptive yet.
- (+) Each adaptive system has a clean swap-in path; "deterministic → GenAI" is a DI binding change, not a rewrite.
- (+) Telemetry capture begins from user 1 — no retrofit for v1 personalization.
- (+) Operator-injectable rules give a tuning surface even before GenAI lands.
- (−) MVP doesn't visibly demonstrate the "novel" features; a third-party demo would show "yet another LeetCode" unless the pluggability story is told well.
- (−) Carries the cost of building 4 policy interfaces + their default impls in MVP, even though the "real" implementations land in v1.

**Owner:** user (Rahul) — confirmed 2026-04-25 ("Path A confirmed.")
**Related:** STORY-052, STORY-053, STORY-054, STORY-055, STORY-056, STORY-057. The 6 entries in [`docs/vision/NOVEL_IDEAS.md`](../vision/NOVEL_IDEAS.md) from the same conversation. [ADR-0006](../architecture/ADR-0006-agentic-orchestration.md) records the single-agent orchestration shape that those interfaces plug into.

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
