# LearnPro Board

> **Last updated:** 2026-04-25 (Phase B of EPIC-017 product grooming complete; Phase A queued)
> **How to read this:** This is the live status of every Epic, Story, and Task in the project. Hand-maintained for now (a regenerator script lives in the v1 backlog). When you change an item's `status:` frontmatter, also update the row here in the same commit.

---

## In Progress

| ID | Title | Type | Phase | Priority | Est | Owner |
|----|-------|------|-------|----------|-----|-------|
| [EPIC-017](epics/EPIC-017-product-discovery.md) | Product discovery, competitive positioning, and feature grooming | epic | scaffolding | P0 | — | claude |

---

## Up Next (Ready)

EPIC-017 product grooming is mid-flight. Phase B (competitive + differentiators) is done; Phase A (UX deep-dive) is next. After EPIC-017 closes, MVP build begins with EPIC-002.

| ID | Title | Type | Phase | Priority | Est |
|----|-------|------|-------|----------|-----|
| [STORY-029](stories/STORY-029-ux-deep-dive.md) | Per-feature UX deep-dive on MVP epics (Phase A) | story | scaffolding | P0 | L |
| [STORY-030](stories/STORY-030-backlog-expansion.md) | Backlog expansion — 40–60 ideas, 15+ filed (Phase C) | story | scaffolding | P0 | L |

### After EPIC-017 closes — MVP build begins

| ID | Title | Type | Phase | Priority | Est |
|----|-------|------|-------|----------|-----|
| [STORY-005](stories/STORY-005-auth-and-onboarding.md) | Auth.js + 5-question onboarding | story | mvp | P0 | M |
| [STORY-006](stories/STORY-006-monaco-editor.md) | Monaco editor + run button + result panel | story | mvp | P0 | M |
| [STORY-007](stories/STORY-007-python-runner.md) | Python sandbox runner via Piston | story | mvp | P0 | M |
| [STORY-008](stories/STORY-008-typescript-runner.md) | TypeScript sandbox runner via Piston | story | mvp | P0 | S |
| [STORY-009](stories/STORY-009-llm-gateway.md) | `LLMProvider` interface + Anthropic adapter | story | mvp | P0 | M |

---

## Backlog (MVP — selected)

| ID | Title | Epic | Phase | Priority | Est |
|----|-------|------|-------|----------|-----|
| [STORY-010](stories/STORY-010-sandbox-hardening.md) | Verify sandbox hardening checklist (no-net, ro rootfs, cgroups, seccomp, non-root) | EPIC-003 | mvp | P0 | M |
| [STORY-011](stories/STORY-011-tutor-agent-tools.md) | Tutor agent with `assign-problem` / `give-hint` / `grade` / `update-profile` tools | EPIC-004 | mvp | P0 | L |
| [STORY-012](stories/STORY-012-cost-telemetry.md) | Per-call LLM cost & latency telemetry + per-user daily token budget | EPIC-004 | mvp | P0 | S |
| [STORY-013](stories/STORY-013-learner-profile-schema.md) | Learner profile schema (per-concept skill, episodic log, `org_id` everywhere) | EPIC-005 | mvp | P0 | M |
| [STORY-014](stories/STORY-014-pgvector-schema.md) | pgvector column on `episodes` (schema only — retrieval comes in v1) | EPIC-005 | mvp | P1 | XS |
| [STORY-015](stories/STORY-015-session-plan.md) | Session plan agent (3–5 micro-objectives per session) | EPIC-006 | mvp | P0 | M |
| [STORY-016](stories/STORY-016-seed-bank.md) | Curated seed problem bank (~30 Python + ~30 TS) with hidden tests | EPIC-007 | mvp | P0 | L |
| [STORY-017](stories/STORY-017-hint-ladder.md) | 3-rung hint ladder | EPIC-007 | mvp | P0 | S |
| [STORY-018](stories/STORY-018-heuristic-difficulty.md) | Heuristic difficulty tuner (time + hints + errors → next difficulty) | EPIC-007 | mvp | P0 | S |
| [STORY-019](stories/STORY-019-python-track.md) | Python fundamentals track | EPIC-009 | mvp | P0 | M |
| [STORY-020](stories/STORY-020-typescript-track.md) | TypeScript fundamentals track | EPIC-009 | mvp | P0 | M |
| [STORY-021](stories/STORY-021-onboarding-interview.md) | Career-aware onboarding interview (target role, time budget, level) | EPIC-010 | mvp | P0 | S |
| [STORY-022](stories/STORY-022-xp-and-streak.md) | XP, streak with grace days, per-track progress bar | EPIC-011 | mvp | P0 | S |
| [STORY-023](stories/STORY-023-notifications-mvp.md) | In-app notification center + browser Web Push | EPIC-012 | mvp | P1 | M |
| [STORY-024](stories/STORY-024-quiet-hours.md) | User-configurable quiet hours | EPIC-012 | mvp | P1 | XS |
| [STORY-025](stories/STORY-025-responsive-web.md) | Responsive web app (Windows browser baseline) | EPIC-013 | mvp | P1 | S |
| [STORY-026](stories/STORY-026-data-export.md) | GDPR-style JSON data export endpoint | EPIC-002 | mvp | P1 | S |
| [STORY-027](stories/STORY-027-accessibility-baseline.md) | Accessibility baseline (keyboard nav, Monaco screen-reader labels) | EPIC-002 | mvp | P1 | S |

> **Backlog beyond MVP:** stories for v1/v2/v3 epics will be created as those phases approach (so backlog doesn't get stale). See each [EPIC-xxx](epics/) file for its planned scope.

---

## Recently Done

EPIC-017 Phase B done (2026-04-25). EPIC-001 closed in full on 2026-04-25 (initial scaffolding commit `c1e17a1`).

| ID | Title | Done |
|----|-------|------|
| [STORY-028](stories/STORY-028-competitive-and-differentiators.md) | Competitive teardown + differentiators spec (Phase B) | 2026-04-25 |
| [EPIC-001](epics/EPIC-001-initialization.md) | Repository initialization & scaffolding | 2026-04-25 |
| [STORY-001](stories/STORY-001-init-git-repo.md) | Initialize git repo with Windows-friendly hygiene | 2026-04-25 |
| [STORY-002](stories/STORY-002-write-vision-docs.md) | Capture raw vision + groomed feature catalog + recommended additions | 2026-04-25 |
| [STORY-003](stories/STORY-003-architecture-and-roadmap.md) | Author architecture doc, 5 ADRs, MVP scope, and phased roadmap | 2026-04-25 |
| [STORY-004](stories/STORY-004-stand-up-tracking.md) | Stand up in-repo Epic/Story/Task tracking system | 2026-04-25 |

### Day-1 scaffolding tasks (all done)

| ID | Title | Done | Story |
|----|-------|------|-------|
| [TASK-001](tasks/TASK-001-git-init.md) | `git init` and set default branch to `main` | 2026-04-25 | STORY-001 |
| [TASK-002](tasks/TASK-002-write-gitignore.md) | Write `.gitignore` (Windows + Mac + Linux + Node + Python + Docker) | 2026-04-25 | STORY-001 |
| [TASK-003](tasks/TASK-003-write-gitattributes.md) | Write `.gitattributes` (LF normalization, CRLF for Windows scripts) | 2026-04-25 | STORY-001 |
| [TASK-004](tasks/TASK-004-write-editorconfig-nvmrc.md) | Write `.editorconfig`, `.nvmrc`, `.env.example` | 2026-04-25 | STORY-001 |
| [TASK-005](tasks/TASK-005-write-license.md) | Write `LICENSE` (BSL 1.1) | 2026-04-25 | STORY-001 |
| [TASK-006](tasks/TASK-006-write-readme.md) | Write `README.md` | 2026-04-25 | STORY-001 |
| [TASK-007](tasks/TASK-007-write-claude-md.md) | Write `CLAUDE.md` | 2026-04-25 | STORY-001 |
| [TASK-008](tasks/TASK-008-raw-vision.md) | Save `docs/vision/RAW_VISION.md` (verbatim brain-dump) | 2026-04-25 | STORY-002 |
| [TASK-009](tasks/TASK-009-groomed-features.md) | Author `docs/vision/GROOMED_FEATURES.md` (11 themes) | 2026-04-25 | STORY-002 |
| [TASK-010](tasks/TASK-010-recommended-additions.md) | Author `docs/vision/RECOMMENDED_ADDITIONS.md` (gap analysis) | 2026-04-25 | STORY-002 |
| [TASK-011](tasks/TASK-011-architecture-doc.md) | Author `docs/architecture/ARCHITECTURE.md` | 2026-04-25 | STORY-003 |
| [TASK-012](tasks/TASK-012-write-adrs.md) | Write 5 ADRs (monorepo, sandbox, llm-provider, database, license) | 2026-04-25 | STORY-003 |
| [TASK-013](tasks/TASK-013-mvp-and-roadmap.md) | Author `docs/roadmap/MVP.md` and `ROADMAP.md` | 2026-04-25 | STORY-003 |
| [TASK-014](tasks/TASK-014-tracking-readme-and-templates.md) | Author `project/README.md` + EPIC/STORY/TASK templates | 2026-04-25 | STORY-004 |
| [TASK-015](tasks/TASK-015-write-16-epics.md) | Pre-populate all 16 Epic files | 2026-04-25 | STORY-004 |
| [TASK-016](tasks/TASK-016-write-board-and-stories.md) | Pre-populate `BOARD.md`, ~27 Stories, ~17 Tasks | 2026-04-25 | STORY-004 |
| [TASK-017](tasks/TASK-017-folder-stubs-and-commit.md) | Create empty-folder README stubs + initial commit | 2026-04-25 | STORY-004 |

---

## Blocked

_(none)_

---

## Canceled

_(none)_

---

## Epic index

| ID | Epic | Status | Phase | Priority |
|----|------|--------|-------|----------|
| [EPIC-001](epics/EPIC-001-initialization.md) | Repository initialization & scaffolding | done | scaffolding | P0 |
| [EPIC-002](epics/EPIC-002-mvp-loop.md) | MVP single learning loop | backlog | mvp | P0 |
| [EPIC-003](epics/EPIC-003-sandbox.md) | Containerized code sandbox | backlog | mvp | P0 |
| [EPIC-004](epics/EPIC-004-tutor-agent.md) | Tutor agent harness | backlog | mvp | P0 |
| [EPIC-005](epics/EPIC-005-learner-profile.md) | Learner profile & episodic memory | backlog | mvp | P0 |
| [EPIC-006](epics/EPIC-006-multi-horizon-planning.md) | Multi-horizon planning (session/day/week/mastery) | backlog | mvp | P1 |
| [EPIC-007](epics/EPIC-007-adaptive-problems.md) | Adaptive problem generation & grading | backlog | mvp | P0 |
| [EPIC-008](epics/EPIC-008-voice-tutor.md) | Voice tutor (deferred to v1) | backlog | v1 | P2 |
| [EPIC-009](epics/EPIC-009-learning-tracks.md) | Learning tracks (Python, TS → DSA → ML/DL) | backlog | mvp | P0 |
| [EPIC-010](epics/EPIC-010-career-curriculum.md) | Career-aware curriculum | backlog | mvp | P1 |
| [EPIC-011](epics/EPIC-011-gamification.md) | Gamification (XP, streak, badges — no dark patterns) | backlog | mvp | P1 |
| [EPIC-012](epics/EPIC-012-notifications.md) | Notifications (in-app, push, email, WhatsApp) | backlog | mvp | P1 |
| [EPIC-013](epics/EPIC-013-cross-platform.md) | Cross-platform (Windows-first → PWA → mobile) | backlog | mvp | P1 |
| [EPIC-014](epics/EPIC-014-rag-memory.md) | RAG / agent memory | backlog | v1 | P2 |
| [EPIC-015](epics/EPIC-015-saas-readiness.md) | SaaS readiness primitives (`org_id`, adapters, data export) | backlog | mvp | P1 |
| [EPIC-016](epics/EPIC-016-security-and-anti-cheat.md) | Security & anti-cheat | backlog | mvp | P0 |
| [EPIC-017](epics/EPIC-017-product-discovery.md) | Product discovery, competitive positioning, and feature grooming | in-progress | scaffolding | P0 |
