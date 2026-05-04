# LearnPro Board

> **Last updated:** 2026-05-03 (STORY-020 done. The TypeScript fundamentals track now mirrors the Python one: `typescript-fundamentals.yaml` covers **12 of 13 spec'd concepts** (`modules` deferred until a TS problem in the bank exercises module syntax — same bank-coverage discipline STORY-019 applied to its 3 deferrals) with 28 refs into 25 of the 30 TS problems. Loader unchanged from STORY-019; only adds `TYPESCRIPT_FUNDAMENTALS_PATH` alongside `PYTHON_FUNDAMENTALS_PATH`. Loader rejects orphan refs / forward prerequisites / duplicate concept slugs at parse time — same invariants as the Python track. 11 new unit tests + 1 DATABASE_URL-gated integration test. Track-picker UI + progress-bar UI deferred to STORY-022 / dashboard, same as STORY-019. **Both MVP-language tracks are now seedable**, ready for the `/dashboard` work to render them.) (Earlier: STORY-026 + STORY-019 + STORY-011 all done. **MVP loop is API-complete.** STORY-011: hand-rolled tutor agent harness in new `@learnpro/agent` (no LangChain — per ADR-0003) with state machine `assign → coding → (hint | submit) → grading → profile-update → next` + 4 tools (`assignProblem` / `giveHint` / `grade` / `updateProfile`); 4 Fastify routes (`/v1/tutor/episodes/...`); replay-fixture eval test + DATABASE_URL-gated integration. UI deferred to STORY-062 (filed). STORY-026: GDPR-style `GET /v1/export` streams JSON envelope (profile / episodes / submissions / agent_calls / notifications / settings) scoped by session cookie; in-memory `MemoryRateLimiter` 1/hr per user; round-trip-importable shape; `importDump()` → STORY-061, Redis limiter → STORY-062 (existing). STORY-019: new `@learnpro/tracks` package mirrors `@learnpro/problems`; `python-fundamentals.yaml` covers 9 ordered concepts (3 spec concepts deferred until seed bank covers them) with 21 refs into 19 of 33 Python problems; loader rejects orphan refs / forward prerequisites at parse time.)
> **How to read this:** This is the live status of every Epic, Story, and Task in the project. Hand-maintained for now (a regenerator script lives in the v1 backlog). When you change an item's `status:` frontmatter, also update the row here in the same commit.

---

## In Progress

| ID | Title | Type | Phase | Priority | Est | Owner |
|----|-------|------|-------|----------|-----|-------|
| [EPIC-018](epics/EPIC-018-repo-automation.md) | Repo automation & Claude Code skills | epic | scaffolding | P1 | — | claude |
| [STORY-051](stories/STORY-051-claude-skills-and-stop-hook.md) | `harvest-knowledge` + `work-tracking` skills + Stop hook | story | scaffolding | P1 | M | claude |

---

## Up Next (Ready) — MVP build begins here

Path A locked 2026-04-25. EPIC-019 (foundation) + auth (STORY-005) + onboarding (STORY-053) + seed bank (STORY-016) all shipped. The remaining bottleneck is **STORY-011 (tutor agent)** — once it lands the MVP loop closes (track → tutor assigns problem → user codes → sandbox runs → grader → tutor explains → next problem).

| ID | Title | Epic | Phase | Priority | Est |
|----|-------|------|------|----------|-----|
| [STORY-011](stories/STORY-011-tutor-agent-tools.md) | Tutor agent with `assign-problem` / `give-hint` / `grade` / `update-profile` tools | EPIC-004 | mvp | P0 | L |

---

## Backlog (MVP — selected)

| ID | Title | Epic | Phase | Priority | Est |
|----|-------|------|-------|----------|-----|
| [STORY-015](stories/STORY-015-session-plan.md) | Session plan agent (3–5 micro-objectives per session) | EPIC-006 | mvp | P0 | M |
| [STORY-017](stories/STORY-017-hint-ladder.md) | 3-rung hint ladder | EPIC-007 | mvp | P0 | S |
| [STORY-021](stories/STORY-021-onboarding-interview.md) | Career-aware onboarding interview (target role, time budget, level) | EPIC-010 | mvp | P0 | S |
| [STORY-022](stories/STORY-022-xp-and-streak.md) | XP, streak with grace days, per-track progress bar | EPIC-011 | mvp | P0 | S |
| [STORY-023](stories/STORY-023-notifications-mvp.md) | In-app notification center + browser Web Push | EPIC-012 | mvp | P1 | M |
| [STORY-024](stories/STORY-024-quiet-hours.md) | User-configurable quiet hours | EPIC-012 | mvp | P1 | XS |
| [STORY-025](stories/STORY-025-responsive-web.md) | Responsive web app (Windows browser baseline) | EPIC-013 | mvp | P1 | S |
| [STORY-027](stories/STORY-027-accessibility-baseline.md) | Accessibility baseline (keyboard nav, Monaco screen-reader labels) | EPIC-002 | mvp | P1 | S |
| [STORY-054](stories/STORY-054-adaptive-autonomy-controller.md) | Adaptive autonomy controller (per-user confidence → Low/Medium/High ask-vs-act bands) | EPIC-004 | mvp | P0 | M |
| [STORY-056](stories/STORY-056-data-retention-and-redaction.md) | Data retention & redaction pipeline (raw 90d / voice 30d / episodes indefinite + PII redaction) | EPIC-016 | mvp | P0 | M |

---

## Backlog (v1 — filed via Phase C)

These stories were filed during EPIC-017 Phase C from the expanded idea catalog ([`docs/vision/RECOMMENDED_ADDITIONS.md`](../docs/vision/RECOMMENDED_ADDITIONS.md)). Selected because each (a) reinforces a differentiator from [`docs/product/DIFFERENTIATORS.md`](../docs/product/DIFFERENTIATORS.md), (b) is startable within the v1 window, and (c) is specific enough to estimate today.

| ID | Title | Epic | Phase | Priority | Est |
|----|-------|------|-------|----------|-----|
| [STORY-031](stories/STORY-031-fsrs-spaced-repetition.md) | FSRS spaced repetition scheduler | EPIC-005 | v1 | P1 | M |
| [STORY-032](stories/STORY-032-knowledge-graph-population.md) | Knowledge graph population (concept prerequisites) | EPIC-005 | v1 | P1 | L |
| [STORY-033](stories/STORY-033-profile-update-agent.md) | Dedicated profile-update agent (split from tutor) | EPIC-004 | v1 | P1 | M |
| [STORY-034](stories/STORY-034-critique-agent-split.md) | Separate critique/grader agent (split from tutor) | EPIC-004 | v1 | P1 | M |
| [STORY-035](stories/STORY-035-prompt-eval-harness.md) | Prompt eval harness (regression suite for tutor prompts) | EPIC-004 | v1 | P0 | M |
| [STORY-036](stories/STORY-036-ollama-fallback.md) | Ollama local-model adapter (privacy / air-gap fallback) | EPIC-004 | v1 | P2 | M |
| [STORY-037](stories/STORY-037-debugging-exercises.md) | Debugging exercises (broken code, find-and-fix) | EPIC-007 | v1 | P1 | L |
| [STORY-038](stories/STORY-038-read-this-code-exercises.md) | "Read this code" exercises (comprehension differentiator) | EPIC-007 | v1 | P1 | L |
| [STORY-039](stories/STORY-039-llm-problem-variants.md) | LLM-generated problem variants on top of seed bank | EPIC-007 | v1 | P2 | M |
| [STORY-040](stories/STORY-040-github-portfolio.md) | GitHub portfolio auto-push (`learnpro-portfolio` repo) | EPIC-013 | v1 | P1 | M |
| [STORY-041](stories/STORY-041-cheatsheet-generator.md) | Personal cheatsheet / notes auto-generation from sessions | EPIC-002 | v1 | P2 | S |
| [STORY-042](stories/STORY-042-anti-cheat-v1.md) | Anti-cheat v1 (keystroke entropy + paste signals; never accusatory) | EPIC-016 | v1 | P1 | M |
| [STORY-043](stories/STORY-043-multi-file-workspaces.md) | Multi-file workspaces in sandbox | EPIC-003 | v1 | P0 | L |
| [STORY-044](stories/STORY-044-pwa-baseline.md) | PWA baseline (manifest + service worker + offline shell) | EPIC-013 | v1 | P1 | M |
| [STORY-045](stories/STORY-045-email-digests.md) | Email digest channel (weekly recap + grace-day notices) | EPIC-012 | v1 | P2 | S |
| [STORY-046](stories/STORY-046-daily-weekly-plans.md) | Daily and weekly plan views (multi-horizon planning UI) | EPIC-006 | v1 | P1 | M |
| [STORY-059](stories/STORY-059-sandbox-streaming.md) | Live stdout/stderr streaming for sandbox runs (split from STORY-006 — Piston is request/response) | EPIC-003 | v1 | P1 | M |
| [STORY-061](stories/STORY-061-import-dump.md) | `importDump()` companion to STORY-026 — round-trip a JSON export back into a fresh instance | EPIC-002 | v1 | P2 | M |
| [STORY-062](stories/STORY-062-redis-rate-limiter.md) | Redis-backed `RateLimiter` for multi-process / multi-replica deployments | EPIC-015 | v1 | P2 | S |

## Backlog (v2 — filed via Phase C)

| ID | Title | Epic | Phase | Priority | Est |
|----|-------|------|-------|----------|-----|
| [STORY-047](stories/STORY-047-mock-interviewer-agent.md) | Mock interviewer agent persona (timed, neutral, debrief) | EPIC-004 | v2 | P1 | L |
| [STORY-048](stories/STORY-048-project-based-learning.md) | Project-based learning — multi-session projects with milestones | EPIC-007 | v2 | P1 | XL |
| [STORY-049](stories/STORY-049-capacitor-mobile.md) | Capacitor mobile wrapper for iOS and Android | EPIC-013 | v2 | P1 | L |
| [STORY-050](stories/STORY-050-whatsapp-notifications.md) | WhatsApp notifications via Meta Cloud API | EPIC-012 | v2 | P1 | M |

> **Backlog beyond Phase C:** stories for the remaining ~96 catalog ideas live in [`docs/vision/RECOMMENDED_ADDITIONS.md`](../docs/vision/RECOMMENDED_ADDITIONS.md) as a deferred inventory. They become STORY files when their phase is picked up (so the backlog doesn't get stale). See each [EPIC-xxx](epics/) file for its planned scope.

---

## Recently Done

STORY-053 (conversational onboarding agent) landed 2026-04-28 — `POST /v1/onboarding/turn` Fastify endpoint orchestrates a multi-turn warm-coach chat using Anthropic Haiku, the system prompt embeds a strict JSON output schema (`assistant_message` / `captured` / `done`) so per-turn profile-field updates are extractable without parsing prose. New `updateProfileFields()` helper in `@learnpro/db` does a partial UPSERT — only supplied non-null columns write. The `/onboarding` page replaces the STORY-005 placeholder with a full chat UI (assistant/user bubbles, "Step N/6" indicator, "Start now (skip)" link, friendly 429/503 banner, brief delay-then-route on `done=true`). Two hard caps prevent runaway cost (`MAX_ONBOARDING_TURNS=6` / `MAX_ONBOARDING_TOKENS=3000`) — over-cap → graceful close-out without LLM call. `LEARNPRO_DISABLE_ONBOARDING_LLM=1` switches to a deterministic 3-question state machine (target_role → time_budget_min → primary_goal) — guarantees AC #6 onboarding-never-blocks-signin. `apps/api/src/index.ts` `defaultsFromEnv()` auto-wires the profile-writer to `DATABASE_URL` when set. 64 new tests; 322 passing / 27 skipped repo-wide. STORY-005 (Auth.js + bootstrap profile shell) landed 2026-04-28 — magic-link + GitHub OAuth via NextAuth v5 in `apps/web`, DB-session strategy with Drizzle adapter (`accounts` / `sessions` / `verificationTokens` in migration `0004_auth_tables.sql`), cross-app session lookup in `apps/api` (cookie → `sessions` table → `users` row, no shared JWT secret), idempotent profile bootstrap on first sign-in, `destinationFor()` routes new users to `/onboarding` and returning users to `/dashboard`. Lazy-init for `next build` (config constructed per-request, not at module load). Mops up 2 of 3 deferred ACs from STORY-060 (`GET /llm/usage/today` + 429 mapping for `TokenBudgetExceededError`) and 1 from STORY-055 (`user_id` stamping on `POST /v1/interactions`). Apps/web has zero direct `pg`/`drizzle-orm` deps — DB access routes through `@learnpro/db` helpers. 244 passing / 21 skipped. STORY-010 (sandbox hardening checklist verification) landed 2026-04-28 — 13 breakout test files cover every ADR-0002 item (no-network / ro-rootfs / tmpfs / cgroup-cpu/mem/pids / wall-clock / output-trunc / dropped-caps / non-root-uid / seccomp / no-`--privileged` repo-wide grep) via a two-mode harness (structural stub for CI, live-Piston opt-in via `LEARNPRO_REQUIRE_PISTON=1`). 38 tests pass + 4 live-only skipped. Hardened `infra/docker/docker-compose.dev.yaml` for defense-in-depth (non-root user, sized tmpfs, drop-all-caps, no-new-privileges, pids/mem/cpu fences). STORY-055 (rich interaction telemetry schema) landed 2026-04-26 — `interactions` table with 9-event `interaction_type` pgEnum + `episodes.interactions_summary` jsonb (migration `0003_interactions.sql`), Zod discriminated union in `@learnpro/shared` (200-event batch cap, optional `t` / `episode_id`), `DrizzleInteractionStore` bulk-insert impl in `@learnpro/db`, `POST /v1/interactions` Fastify endpoint (202/400/503), browser-side `InteractionBatcher` (size + idle flush, `keepalive: true`) + `CursorFocusTracker` (debounced cursor_focus emit) + `RevertDetector` (sliding-snapshot revert detection) + `useInteractionCapture` React hook wired into PlaygroundClient. Voice opt-in toggle UI lands; voice capture deferred to STORY-056 per spec. 35 new tests. STORY-060 (DB-backed UsageStore + agent_calls table) landed 2026-04-26 — Drizzle migration `0002` extends `agent_calls` with all `LLMTelemetryEvent` fields + new `agent_task` enum (complete/stream/embed/tool_call), `DrizzleLLMTelemetrySink` writes one row per event (failures logged + swallowed), `DrizzleUsageStore.today()` aggregates today's tokens against UTC midnight. 3 API-wiring ACs (`GET /llm/usage/today`, 429 mapping, manual smoke) deferred to STORY-005 since they need auth middleware. STORY-018 (heuristic difficulty tuner) landed 2026-04-26 — per-episode `difficultySignal` + `nextDifficulty` + `episodeSuccessScore` + Bayesian-flavored `updateSkillScore` in `packages/scoring/src/difficulty.ts`, all tunable via Zod-schema'd config, 20 unit tests covering perfect/hint-heavy/repeated-failure/overtime/under-time/no-progress + capped-at-extremes + operator-stricter-threshold scenarios. STORY-012 (per-call LLM cost telemetry + per-user daily token budget) landed 2026-04-26 — versioned `MODEL_PRICING` + `costFor()` calculator, `DailyTokenBudget` with Opus → Sonnet → Haiku tier ladder + downgrade at 80%, `BudgetGatedLLMProvider` decorator. DB-backed sink + `agent_calls` migration split into [STORY-060](./stories/STORY-060-agent-calls-db-sink.md). STORY-006 (Monaco editor + Run button + result panel) landed 2026-04-26 — first user-facing feature in `apps/web`. STORY-008 (TypeScript sandbox runner via Piston) landed 2026-04-26. STORY-007 (Python sandbox runner via Piston) landed 2026-04-26 (PR #14) — first feature Story under EPIC-003. STORY-013 (learner profile schema) landed 2026-04-26 (PR #11) — first feature Story under EPIC-005. STORY-009 (LLM gateway) landed 2026-04-26 (PR #9) — first feature Story under EPIC-004. EPIC-019 (foundation) closed 2026-04-26 with STORY-052 (monorepo skeleton, PR #5) and STORY-057 (policy adapters, PR #7). GitHub repo + PR workflow landed 2026-04-25 (PR #1, STORY-058). EPIC-017 product grooming closed in full on 2026-04-25 (Phases A + B + C). EPIC-001 closed on 2026-04-25 (initial scaffolding commit `c1e17a1`). Phase A commit: `bbf7300`.

| ID | Title | Done |
|----|-------|------|
| [STORY-020](stories/STORY-020-typescript-track.md) | TypeScript fundamentals track — 12-concept ordered YAML mirrors the Python track + 11 loader tests + DATABASE_URL-gated seed integration test (1 spec concept `modules` deferred until seed bank covers it; track-picker UI + progress-bar UI deferred to STORY-022 / dashboard, same shape as STORY-019) | 2026-05-03 |
| [STORY-011](stories/STORY-011-tutor-agent-tools.md) | Tutor agent with `assign-problem` / `give-hint` / `grade` / `update-profile` tools (hand-rolled state machine + 4 tools + 4 API routes + replay fixture; `/session` UI → STORY-062) | 2026-05-03 |
| [STORY-026](stories/STORY-026-data-export.md) | GDPR-style JSON data export endpoint (`GET /v1/export` streaming + `MemoryRateLimiter` + round-trip-importable shape; `importDump()` → STORY-061, Redis limiter → STORY-062) | 2026-05-03 |
| [STORY-019](stories/STORY-019-python-track.md) | Python fundamentals track — 9-concept ordered YAML + Zod-validated loader + idempotent `seedTrack` (3 spec concepts deferred until seed bank covers them; track-picker UI + progress-bar UI deferred to dashboard / STORY-022) | 2026-05-01 |
| [STORY-053](stories/STORY-053-conversational-onboarding-agent.md) | Conversational onboarding agent (warm-coach Haiku chat + structured-form fallback + 6-turn / 3000-token caps + incremental profile persistence) | 2026-04-28 |
| [STORY-016](stories/STORY-016-seed-bank.md) | Curated seed problem bank — 33 Python + 30 TypeScript YAMLs with hidden tests, schema/loader/validate/seed test suites, target difficulty distribution | 2026-04-28 |
| [STORY-005](stories/STORY-005-auth-and-onboarding.md) | Auth.js + bootstrap profile shell (magic link + GitHub OAuth, DB sessions, cross-app cookie auth, mops up STORY-060/STORY-055 deferred ACs) | 2026-04-28 |
| [STORY-010](stories/STORY-010-sandbox-hardening.md) | Sandbox hardening checklist verification (12 breakout tests + harness; docker-compose hardened) | 2026-04-28 |
| [STORY-055](stories/STORY-055-rich-interaction-telemetry-schema.md) | Rich interaction telemetry schema + ingestion endpoint + Monaco capture (voice capture deferred to STORY-056) | 2026-04-26 |
| [STORY-060](stories/STORY-060-agent-calls-db-sink.md) | DB-backed `UsageStore` + `agent_calls` table (3 API-wiring ACs deferred to STORY-005) | 2026-04-26 |
| [STORY-018](stories/STORY-018-heuristic-difficulty.md) | Heuristic difficulty tuner (per-episode signal + next-difficulty step + EWMA skill score) | 2026-04-26 |
| [STORY-012](stories/STORY-012-cost-telemetry.md) | Per-call LLM cost & latency telemetry + per-user daily token budget (DB sink → STORY-060) | 2026-04-26 |
| [STORY-006](stories/STORY-006-monaco-editor.md) | Monaco editor + Run button + result panel (`/playground` → Next.js proxy → Fastify `/sandbox/run`) | 2026-04-26 |
| [STORY-008](stories/STORY-008-typescript-runner.md) | TypeScript sandbox runner via Piston (TS-specific unit/integration/API tests on top of STORY-007 infra) | 2026-04-26 |
| [STORY-007](stories/STORY-007-python-runner.md) | Python sandbox runner via Piston (`SandboxProvider` + `PistonSandboxProvider` + `POST /sandbox/run`) | 2026-04-26 |
| [STORY-014](stories/STORY-014-pgvector-schema.md) | pgvector IVFFlat index on `episodes.embedding` (column landed in STORY-013) | 2026-04-26 |
| [STORY-013](stories/STORY-013-learner-profile-schema.md) | Learner profile schema (per-concept skill, episodic log, `org_id` everywhere) | 2026-04-26 |
| [STORY-009](stories/STORY-009-llm-gateway.md) | `LLMProvider` interface + Anthropic adapter | 2026-04-26 |
| [EPIC-019](epics/EPIC-019-build-foundation.md) | Build foundation — monorepo, dev env, shared interfaces | 2026-04-26 |
| [STORY-057](stories/STORY-057-policy-adapter-interfaces.md) | Policy-adapter interfaces + deterministic defaults | 2026-04-26 |
| [STORY-052](stories/STORY-052-monorepo-skeleton.md) | Monorepo skeleton + dev Docker Compose + CI | 2026-04-26 |
| [STORY-058](stories/STORY-058-github-repo-and-pr-workflow.md) | GitHub repo + PR-based workflow + branch protection | 2026-04-25 |
| [EPIC-017](epics/EPIC-017-product-discovery.md) | Product discovery, competitive positioning, and feature grooming | 2026-04-25 |
| [STORY-030](stories/STORY-030-backlog-expansion.md) | Backlog expansion — 116-idea catalog + 20 stories filed (Phase C) | 2026-04-25 |
| [STORY-029](stories/STORY-029-ux-deep-dive.md) | Per-feature UX deep-dive on MVP epics (Phase A) | 2026-04-25 |
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
| [EPIC-017](epics/EPIC-017-product-discovery.md) | Product discovery, competitive positioning, and feature grooming | done | scaffolding | P0 |
| [EPIC-018](epics/EPIC-018-repo-automation.md) | Repo automation & Claude Code skills | in-progress | scaffolding | P1 |
| [EPIC-019](epics/EPIC-019-build-foundation.md) | Build foundation — monorepo, dev env, shared interfaces | done | mvp | P0 |
