# Decisions log

> Running log of cross-cutting product and engineering judgment calls that don't warrant a full ADR. Maintained by the [`harvest-knowledge`](../../.claude/skills/harvest-knowledge/SKILL.md) skill at the end of each relevant session. Newest entries on top.
>
> **For full ADRs** (architecture-shape decisions) see [`docs/architecture/`](../architecture/) and the narrow-ADR overflow in this folder ([README](./README.md)).
>
> **Entry format:** see the bottom of this file.

---

## 2026-05-11 — Squash-rebase as a fallback when iterative rebase hits too many conflicts; STORY-NNNg follow-up convention for "defer the wiring, ship the structure"

**Context:** STORY-039e (admin failed-gate surface for LLM-generated variants) was authored against an older `main` and accumulated 12 commits before the orchestrator started merging follow-ups in parallel. By the time PR #76 was ready, `main` had moved through six merges (STORY-038b, 039a, 039c, 039d, 039f, 034a, 045a) — five of which collided with STORY-039e on the same files (`packages/agent/src/{index.ts, problem-variants.ts, problem-variants.test.ts}` and `apps/api/src/problem-variants{.ts, .test.ts}`). The standard rebase loop produced cascade conflicts: every one of the 12 commits re-introduced a conflict on the same chunk, and resolving them one by one was producing inconsistent intermediate states that the next commit's rebase then re-conflicted against. After ~15 minutes the orchestrator gave up on the iterative rebase and switched strategy.

**Decision:**
1. **When iterative rebase produces a cascade (every commit reconflicts on the same files), switch to squash-rebase.** Procedure:
   1. `git rebase --abort` to bail out.
   2. `git reset --hard origin/main` on the branch worktree.
   3. `git checkout origin/<branch> -- .` to overlay the branch's tip files onto main.
   4. For any file the branch's tip OVERWROTE that main's newer commits had also modified (i.e., files involved in the cascade), `git checkout origin/main -- <file>` to restore main's version, then re-apply the branch's additive parts via targeted Edit. This concentrates the conflict resolution into ONE pass, not 12.
   5. Stage everything, `pnpm format`, write a single squash commit explaining what was preserved vs. deferred, force-push.
2. **`STORY-NNNg` is reserved for "ship the structure now, wire the cross-cutting glue next."** When a follow-up's runtime integration (the wiring that crosses three packages) collides irreconcilably with a sibling follow-up that landed first, ship the new STRUCTURE (DB tables, migrations, routes, types, UI surfaces) under the original `STORY-NNN<letter>` and file the WIRING as `STORY-NNNg` (always the 'g' letter for "glue / generic-followup"). The follow-up commit message must call out exactly what's left unwired, with a concrete one-line description per missing edge. For STORY-039e, that was: "agent-side `failureLogger` wiring (passing failureLogger to `generateProblemVariant` + `safeLogFailure` calls in `tryGenerateOne`) is NOT included in this commit because it conflicted non-trivially with STORY-039d's spec-clarity judge runtime integration that landed on main first. The variant_gate_failures table is set up to receive failure entries; wiring the agent to write to it is filed as a STORY-039g follow-up."

**Alternatives considered:**
- **Power through the cascade rebase no matter the cost** — would have eaten another 30+ minutes of orchestrator time and produced merge commits with ambiguous resolutions (the same conflict resolved differently across 12 commits). Rejected.
- **Squash the branch's 12 commits into 1 BEFORE rebasing** (`git rebase -i origin/main --autosquash` with `s` markers, or `git reset --soft $(git merge-base origin/main HEAD) && git commit`) — equivalent to the squash-rebase strategy but doesn't help if the squashed diff still conflicts on the same chunks; the file-by-file restoration step in the squash-rebase strategy IS the part that breaks the cascade. Squash-only without file restoration was tried first and didn't help.
- **Drop the conflicting commits from the rebase (`git rebase --skip`)** — would lose the actual work. Rejected.

**Consequences:**
- (+) Cascade conflicts now have a documented escape hatch.
- (+) The 'g' suffix gives a clean signal in `STORY-NNN[a-z]*.md` globs: anything ending in `g` is a known wiring gap, not just another follow-up.
- (–) Squash-rebase loses per-commit attribution in `git log`. The squash commit's body must summarize what each squashed commit contributed. This session's STORY-039e squash commit follows that pattern.
- (–) Future follow-ups need to know: when picking up STORY-039g, the test file at `apps/api/src/problem-variants.test.ts` won't have the failureLogger expectations the original STORY-039e branch added. STORY-039g picks those up from the structural state, not by cherry-picking.

**Owner:** user (via standing "merge all and proceed" directive that prompted the strategy switch).
**Related:** STORY-039e (squash-rebased into PR #76 commit `4edd8f1`), STORY-039g (to be filed by work-tracking), the 2026-05-11 cycle-break entry above for the parent agent-dispatch playbook.

---

## 2026-05-11 — Cycle-break for the variant seeding CLI; NOT-NULL column ripple cost; agent TaskStop as a fight-the-edit-loop tool

**Context:** STORY-039f shipped an operator CLI (`pnpm --filter @learnpro/problems seed:variants`) to top up the `problem_variants` cache. The agent placed the CLI in `packages/problems/src/seed-variants-cli.ts` and added `@learnpro/agent` to `packages/problems`'s `devDependencies` because the CLI imports `seedVariantsForProblem` from `@learnpro/agent`. `@learnpro/agent` already depends on `@learnpro/problems` for the seed bank — so the dev-only back-edge creates a workspace cycle. The agent's `NOTE on the workspace dep cycle:` claimed pnpm only warns and that it's harmless for tooling-only entry points. **Turborepo disagrees:** `turbo run typecheck` errored with `Cyclic dependency detected: @learnpro/problems#build, @learnpro/agent#build` and refused to run any task. Separately, STORY-039e added `users.is_admin boolean NOT NULL default false` and `SessionUser` (the apps/api type) gained `is_admin: boolean` as required — every test factory across `apps/api/src/*.test.ts` (~8 files) and `packages/db/src/data-export.test.ts` then failed typecheck because they constructed a user-shaped object without `is_admin`. CI caught both classes of breakage; neither was visible in the agent's local typecheck which ran scoped to its own package.

**Decision:**
1. **Workspace cycles, even dev-only, are forbidden in this monorepo.** If package A's CLI consumes a helper that lives in package B, and B already depends on A, the CLI moves to B. Concretely: the variant seeding CLI now lives in `packages/agent/src/seed-variants-cli.ts` next to `seed-variants.ts` (the helper it wraps); operator runs `pnpm --filter @learnpro/agent seed:variants` instead of `--filter @learnpro/problems`. `@learnpro/problems`'s `package.json` is clean of the back-edge dev-dep + the script. Agent prompts that introduce new CLIs now include "if you reach for `@learnpro/X` from `@learnpro/Y` and Y is already in X's deps tree, put the CLI in X."
2. **Adding a NOT-NULL column without a Zod-derived default in the shared user shape ripples to every test factory.** The cheap fix is to add `is_admin: false` (or whatever the new column default is) to every fixture; the structural fix is to derive the test factory type from `typeof users.$inferInsert` (which respects the column default) instead of from `User` (the select-shape). For STORY-039e the cheap fix was the right call (8 occurrences, mechanical). The structural fix is filed mentally but not yet a Story — promote to one only if a third NOT-NULL ripple lands.
3. **`TaskStop` is the right tool when an agent and the orchestrator are editing the same file in opposite directions.** During this run, two agents (STORY-039f's running agent and the orchestrator) were ping-ponging `packages/problems/package.json` — the agent kept re-adding the dev-dep, the orchestrator kept removing it. `TaskStop <agent-id>` (then orchestrator finishes the resolution + commits + pushes) is faster than waiting for the agent to finish and rebasing afterward. Use it when the agent's last `<result>` snippet shows it's mid-fix on the same file you're editing.
4. **Migration-number contention now has a concrete failure mode.** STORY-039c (per-user seen-seed, merged via PR #77) took migration `0024_episode_variant_of`. STORY-039e (admin failed-gate, in flight as PR #76) also claimed 0024 and 0025. Resolution: renumbered STORY-039e to 0025 and 0026, updated `_journal.json` accordingly, updated the story-file activity log to reference the new numbers, updated the BOARD.md "Last updated" header body text. Total cost ~5 min of careful editing. The discipline from the 2026-05-06 entry (claim numbers up front in the brief) wasn't applied for this batch — re-apply it for the next batch.

**Alternatives considered:**
- **Suppress the Turborepo cycle check via `turbo.json` config** instead of moving the CLI — would let the dev-only cycle live but defeats the safety property the check provides (real runtime cycles would also slip through). Rejected.
- **Derive `SessionUser` from a Zod schema with `is_admin` defaulting to `false`** — would let test factories omit `is_admin` and still typecheck. Strictly better. Not done in this session because the cheap fix unblocked CI and the structural change touches the auth boundary. Filed as a mental followup; promote to a Story if a third NOT-NULL column ripples through the same test factories.

**Consequences:**
- (+) Future CLIs in this monorepo follow the "place at the deepest consumer" rule by default.
- (+) Adding NOT-NULL columns is now a known-cost operation: budget ~10 min of test-factory updates per new required column.
- (+) The `TaskStop` reflex shortens the orchestrator-vs-agent edit-loop from "wait + rebase" to "stop + finish."
- (–) `pnpm-lock.yaml` rebuild was required for the cycle-break (the dev-dep removal changed the manifest); CI failed once with `ERR_PNPM_OUTDATED_LOCKFILE` before the orchestrator ran `pnpm install` and committed the lockfile sync.

**Owner:** user (via standing "keep building, fix as you go" directive).
**Related:** STORY-039f (`story/039f-variant-seeding-cli`), STORY-039e (`story/039e-admin-failed-gate-surface`), STORY-039c (PR #77 merged at `96baa54`), the 2026-05-06 DECISIONS_LOG entry above for the parent agent-dispatch playbook.

---

## 2026-05-06 — STORY-NNNa convention for in-Story deferred follow-ups; agent-dispatch operational lessons from the v1-finishing run

**Context:** The session that closed v1 (19 P0/P1/P2 stories merged in one push) routinely landed a primary STORY with one or more deferred ACs — too costly to ship in scope, too small to file as a fresh STORY-NNN. STORY-037 deferred the runtime persistence wiring; STORY-039 deferred 4 ACs around novelty / admin / seeding / Piston-validation; STORY-041 deferred the BullMQ trigger; STORY-043 deferred the multi-file grade-tool harness; STORY-046 deferred the entire weekly view; STORY-038 deferred the tutor route fan-out for the comprehension `kind`; STORY-036 deferred live-model validation; etc. Eight deferred follow-ups landed in this session alone (037a, 037b, 038a, 039a, 041a, 043a, 046b, 046c). The convention crystallized as it was used.

**Decision:**
1. **In-Story deferred follow-ups are filed as `STORY-NNN<letter>`** — same parent epic, same `phase` (or `phase: v1-followup` when it post-dates the parent's phase close), priority generally one tier lower than the parent unless the parent specifically called the deferral out as P1. The original STORY's activity log gets a "Deferred to STORY-NNN<letter>" line at close.
2. **The deferred AC list lives in two places** — checkbox-line in the parent STORY's AC section (struck-through with the follow-up reference), and full ACs restated on the STORY-NNN<letter> file. The follow-up file's frontmatter `description` opens with "Deferred follow-up from STORY-NNN."
3. **Migration-number contention in parallel agent dispatch is solved by claiming a number up front in the brief.** When dispatching N agents that each add a Drizzle migration, give each a specific `0NNN_<slug>.sql` number in the agent prompt; if an agent claims a number then doesn't end up needing the migration, the next dispatch fills the gap. Otherwise concurrent agents collide on the next-free number and merge resolution costs minutes per cascade.
4. **Format-check is a hard CI gate; every agent dispatch must run `pnpm format` as a final pre-commit step.** This session's PRs failed CI on `prettier --check` ~8 times before the pattern stuck. Brief agents with a checklist that includes `pnpm format && pnpm format:check` after the last commit and before push.
5. **`apps/api/src/index.ts` `defaultsFromEnv()` and `BuildServerOptions` are the central wiring contention point** — almost every multi-agent batch produced a 3-way conflict here. The mitigation that worked: brief each agent to add new wiring as a small isolated block at the end of `defaultsFromEnv()`, never reorder the existing options; brief them to add new `BuildServerOptions` fields at the end of the interface, never re-grouping. Rebase-with-`--ours`-on-BOARD then manually re-write the BOARD section is the consistent resolution recipe.

**Alternatives considered:**
- **Promote every deferred AC to a fresh `STORY-NNN`** — clean numbering but loses the parentage signal; future-me reading the BOARD wouldn't see "this is the follow-up to that" without clicking through. Rejected.
- **Inline `STORY-NNN-followup-<slug>.md` instead of `STORY-NNNa.md`** — verbose; sortable only by clicking through. Rejected.
- **Auto-rebase before merge instead of asking agents to format** — would shift the burden to the merge step, where it's already been the most expensive operation. Rejected.

**Consequences:**
- (+) Future sessions can find every deferred follow-up by globbing `STORY-NNN[a-z]*.md`.
- (+) The parent STORY's activity log shows the full chain: ship → defer → follow-up landed.
- (+) Migration cascades stop being a per-PR rebase ceremony.
- (−) STORY ID space gets dense quickly when an Epic spawns multiple follow-ups (037 → 037a → 037b already exists). Acceptable; we still have 26 letters per parent.
- Operational follow-up: this entry codifies what was already practice; CLAUDE.md may eventually want a one-liner pointing at this convention.

**Owner:** assistant — observed across the v1-finishing run on 2026-05-06.
**Related:** STORY-037a / STORY-037b / STORY-038a / STORY-039a / STORY-041a / STORY-043a / STORY-046b / STORY-046c (the eight follow-ups filed this session), DECISIONS_LOG entry above on parallel-agent-dispatch cap collapse (this entry extends those operational lessons), CLAUDE.md `## Coding standards` section.

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
