# GROOMED_FEATURES.md — full feature catalog

This document explodes the 11 themes from [`RAW_VISION.md`](./RAW_VISION.md) into concrete features, grouped by theme, tagged by phase. **Phase tags:** `MVP` (must ship in MVP), `v1` (months 3–5), `v2` (months 6–10), `v3` (months 11+).

A complementary document, [`RECOMMENDED_ADDITIONS.md`](./RECOMMENDED_ADDITIONS.md), captures features the user did not mention but which are needed for the product to actually succeed.

For implementation tracking of any of these features, see [`/project/BOARD.md`](../../project/BOARD.md). Items here become Stories in `project/` when they're picked up.

---

## Theme 1 — Containerized in-browser code sandbox

| Feature | Phase | Notes |
|---|---|---|
| Monaco-based editor with language servers | MVP | VS Code-grade editing; LSP for Python + TS at MVP |
| Per-language runner image (Python, TypeScript) | MVP | Hardened Docker images |
| Per-language runner image (Go, Rust, Java, Kotlin, C) | v1 | Add as MVP loop is proven |
| Stdin/stdout streaming over WebSocket | MVP | Live output during execution |
| Hard resource quotas (CPU, mem, wall-clock, output size) | MVP | **Non-negotiable for safety** |
| Network-isolated execution by default | MVP | Opt-in egress for framework lessons later |
| Multi-file project workspaces (virtual FS) | v1 | Required for any non-trivial problem |
| Framework starter templates (React) | v1 | Spring/Hibernate/Angular in v2 |
| Framework starter templates (Spring Boot, Hibernate, Angular) | v2 | Heavy infra (DB sidecar) |
| Persistent workspaces per problem (resume mid-attempt) | v1 | Stored in object storage |
| Test runner integration (pytest, Jest, JUnit, `go test`) | v1 | Hidden + visible test cases |
| Diff view (user solution vs. reference) | v1 | Visualize what changed after grade |
| Hot-reload dev servers for FE frameworks | v2 | iframe-embedded preview |
| Database-attached sandboxes (Postgres/Redis sidecar) | v2 | Backend lesson realism |
| Collaborative cursors (pair / mentor mode) | v3 | Y.js or similar CRDT |

---

## Theme 2 — LLM-backed agentic harness & evolving learner profile

| Feature | Phase | Notes |
|---|---|---|
| Learner Profile schema (skills, mastery scores, pace, errors, "sharpness") | MVP | Postgres tables, see [ADR-0004](../architecture/ADR-0004-database.md) |
| Episodic memory store (every attempt, hint, mistake, success) | MVP | Postgres + pgvector |
| Tutor agent — reads profile + current task | MVP | Anthropic Claude (Opus for tutor) |
| Heuristic difficulty tuner (time + hints + errors → next-problem level) | MVP | Simple formula, refined later |
| Provider-agnostic LLM gateway (`LLMProvider` interface) | MVP | **Non-negotiable**, see [ADR-0003](../architecture/ADR-0003-llm-provider.md) |
| Token / cost telemetry per user / session | MVP | Daily budget enforcement |
| Critique / grader agent (separate from tutor) | v1 | Reduces "nice tutor" bias |
| Profile-update agent (post-session writeback) | v1 | Async via BullMQ |
| Skill graph / concept ontology (concepts → prerequisites → languages) | v1 | Schema modeled in MVP, populated in v1 |
| "Why am I stuck?" reflection agent (on-demand) | v1 | Reads recent attempt history |
| Prompt versioning + eval harness | v1 | Promptfoo or hand-rolled |
| Local model fallback (Ollama / llama.cpp) | v2 | For privacy-sensitive deployments |

---

## Theme 3 — Multi-horizon planning

| Feature | Phase | Notes |
|---|---|---|
| Session plan — 3–5 micro-objectives for next 25–60 min | MVP | Generated at session start |
| Daily plan — review queue + new material | v1 | Combines spaced-repetition + plan |
| Weekly plan — themed weeks (e.g., "React state week") | v1 | High-level scaffold |
| Mastery roadmap — 3–12 month track to a target role | v2 | Career-aware |
| Re-planner — adjusts when user falls behind / accelerates | v1 | Triggered by missed sessions or surge |
| "What did I do today?" auto-recap | v1 | LLM-generated session summary |
| Calendar / iCal export of planned sessions | v2 | For external calendar apps |

---

## Theme 4 — Adaptive problem generation

| Feature | Phase | Notes |
|---|---|---|
| Curated seed problem bank (~30 / language / track) | MVP | Author by hand at first; quality > quantity |
| Auto-graded problems with hidden test cases | MVP | Run user code against test suite |
| 3-rung hint ladder (nudge → conceptual → near-solution) | MVP | Each rung consumes XP — see Recommended Additions |
| LLM-generated problem variants | v1 | Mutate seed problems; same skill, different surface |
| Difficulty parameters (input size, edge cases, constraints) | v1 | Knobs the tuner can turn |
| Open-ended problems graded by LLM rubric | v1 | For design / code-quality questions |
| Problem deduplication / similarity check | v1 | Avoid showing near-identical items |
| Difficulty calibration dashboard (operator view) | v2 | Inspect/tune the tuner |

---

## Theme 5 — Voice tutor (always-on optional)

**MVP scope: none — deferred per locked decision.** Push-to-talk arrives in v1.

| Feature | Phase | Notes |
|---|---|---|
| Push-to-talk mode | v1 | Web Speech API for prototype |
| STT pipeline (Web Speech → Whisper) | v1 → v2 | Browser-only first, then cloud/self-hosted Whisper |
| TTS (browser SpeechSynthesis → ElevenLabs/OpenAI/Azure) | v1 → v2 | Free first, then quality |
| Voice activity detection (for always-on mode) | v1 | Webrtc-vad-style |
| "Think-aloud" transcription stored alongside keystrokes | v1 | Searchable session record |
| Frustration / confusion detection (prosody + content) | v2 | See Recommended Additions |
| Mute / recording-indicator UI (always visible) | v1 | **Trust — non-negotiable when voice ships** |
| Wake-word for hands-free | v3 | Privacy implications need thought |

---

## Theme 6 — Learning tracks

| Feature | Phase | Notes |
|---|---|---|
| Track definition format (YAML / JSON) | MVP | Authoring surface for new content |
| Coding track: Python fundamentals | MVP | ~30 problems |
| Coding track: TypeScript fundamentals | MVP | ~30 problems |
| Coding track: Go, Rust, Java, Kotlin, C | v1 | One language per cycle |
| Data structures & algorithms track | v1 | Cross-language |
| Classical ML track | v2 | scikit-learn, pandas |
| Deep learning + NN-from-scratch track | v2 | PyTorch, math foundations |
| "Build an LLM from scratch" track | v3 | Capstone-style |
| Cross-track prerequisites (e.g., DSA before LeetCode-style) | v2 | Uses skill graph |
| Custom user-defined tracks | v3 | Power users / instructors |

---

## Theme 7 — Career-aware curriculum

| Feature | Phase | Notes |
|---|---|---|
| Onboarding interview (target role, time budget, current level) | MVP | 5 questions |
| Role library (Backend Java, Frontend React, Full-stack TS, ML Engineer, …) | MVP | Hand-curated initially |
| Recommended language stack (2 to master, 1 to operate in) | MVP | Output of onboarding |
| Job-description parser (paste a JD → gap analysis) | v2 | LLM-driven |
| Resume / portfolio gap report | v2 | What's missing for this role |
| Salary / role-trend integration | v3 | External APIs |

---

## Theme 8 — Gamification

| Feature | Phase | Notes |
|---|---|---|
| XP + levels | MVP | Simple |
| Streaks with grace days | MVP | Grace days prevent rage-quits |
| Per-category progress bars | MVP | "20% in DSA," "40% in React widgets" |
| Badges for concept mastery | v1 | Earned by passing rubric thresholds |
| Skill heatmap visualization | v1 | Visual mastery overview |
| Weekly leaderboard (opt-in only) | v2 | Social pressure done humanely |
| Seasonal challenges | v3 | Time-bound campaigns |
| **No dark patterns** (no loss aversion, no FOMO push) | MVP principle | **Foundational** |

---

## Theme 9 — Notifications

| Feature | Phase | Notes |
|---|---|---|
| In-app notification center | MVP | Bell icon + history |
| Browser Web Push (VAPID) | MVP | Works on Windows/Mac/Android, iOS only via PWA install |
| User-controlled quiet hours + frequency caps | MVP | **Trust — non-negotiable** |
| Email digest (daily / weekly) | v1 | Resend or Postmark |
| WhatsApp via Meta Cloud API | v2 | Lowest cost; Twilio for SMS only |
| SMS fallback | v3 | When push & email both fail |
| Smart re-engagement (decay model, not blanket schedule) | v2 | Pairs with FSRS |

---

## Theme 10 — Cross-platform

| Feature | Phase | Notes |
|---|---|---|
| Windows-first responsive web app | MVP | Browser-based |
| PWA with installability + offline shell | v1 | Manifest + service worker |
| Service worker for cached lessons + queued submissions | v1 | Offline-friendly |
| Capacitor wrapper for iOS / Android | v2 | Wraps the same Next build |
| Native modules for mic + push only | v2 | Minimal native footprint |
| Tablet-optimized layout | v2 | Larger touch targets, side-by-side panels |

---

## Theme 11 — Custom DB, RAG, agentic harness

| Feature | Phase | Notes |
|---|---|---|
| Postgres as system of record | MVP | See [ADR-0004](../architecture/ADR-0004-database.md) |
| pgvector for embeddings | MVP | No second vector DB until proven need |
| Redis for sessions + queues + rate limits | MVP | BullMQ runs on top |
| Agent orchestration (hand-rolled state machine) | MVP | Avoid LangGraph until needed |
| Tool registry (sandbox, profile, plan, grader as agent tools) | MVP | First-class tool definitions |
| RAG over: lesson content, user's past code, official docs | v1 | Knowledge grounding |
| Hybrid search (BM25 + vector) | v2 | Better recall on technical content |
| Local model fallback (Ollama) | v2 | Privacy-mode option |

---

## Cross-cutting concerns (called out for visibility)

These don't sit cleanly under a single theme but appear across many. Tracked as their own Epics in `project/`.

- **Security & anti-cheat** ([Theme 11 + Recommended Additions](./RECOMMENDED_ADDITIONS.md)) — sandbox hardening, paste detection, keystroke entropy.
- **Accessibility baseline** — keyboard nav, screen-reader labels, color-contrast audits.
- **Telemetry & observability** — cost, latency, hint usage, prompt evals.
- **Data export (GDPR-style)** — JSON dump of profile + history.
- **SaaS readiness** — `org_id` columns, feature flags, auth-shape designed-but-not-enforced.
