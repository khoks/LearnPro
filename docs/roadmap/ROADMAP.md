# ROADMAP.md — phased plan from MVP to SaaS launch

> **Source-of-truth note:** This file describes *intent*. The operational plan — what's actually being worked on, in what order, by whom — lives in [`/project/BOARD.md`](../../project/BOARD.md). When this doc and the board disagree, the board wins.

---

## Phase: MVP — weeks 0–8

The single adaptive loop, end-to-end, in Python + TypeScript. Full scope and exit criteria in [`MVP.md`](./MVP.md).

**Exit criteria:** alpha-ready. A user can sign up → onboard → pick a track → solve problems with adaptive difficulty → see their progress → export their data. Sandbox is hardened. Tutor + grader work reliably. Cost telemetry is visible.

---

## Phase v1 — months 3–5 (after MVP ships)

Goal: turn the MVP from "an interesting prototype" into something **a learner would use daily for a month** without losing momentum.

### Headline features
- Languages: **Go, Java, Rust** (Kotlin and C deferred to v1 stretch).
- **Multi-file project workspaces** with virtual filesystem persistence.
- **React framework starter template** with hot-reload preview.
- **Knowledge graph** populated with ~200 concepts and prerequisites.
- **FSRS spaced repetition** scheduling concept reviews into daily plans.
- **Hint ladder XP cost** wired into the difficulty tuner signal.
- **Debugging exercises** (broken code → fix it).
- **"Read this code" exercises** (comprehension testing).
- **GitHub portfolio integration** — auto-push completed projects to a `learnpro-portfolio` repo.
- **Cheatsheet auto-generation** from sessions.
- **Email digests** (daily/weekly summaries).
- **Push-to-talk voice** (Web Speech API) — text fallback always available.
- **PWA installability** + offline shell.
- **Anti-cheat v1** — paste detection + keystroke entropy.
- **Pomodoro / break reminders.**
- **Accessibility audit** + remediations.
- **Prompt eval harness** running on every PR.
- **Daily / weekly plan generation** (mid-horizon planning).
- **"What did I do today?" recap.**
- Critique / grader agent split from tutor agent.
- Profile-update agent (async post-session writeback).

### Exit criteria (v1)
- 5+ languages live with curated problem banks.
- Skill graph drives plan generation (not just heuristics).
- A real cohort of 25–50 alpha users can use LearnPro for 30 consecutive days without major incidents.
- Voice works for users who want it; text-only users are unaffected.

---

## Phase v2 — months 6–10

Goal: **broaden to framework realism** + **add interview prep** (a major willingness-to-pay signal) + **mobile**.

### Headline features
- Frameworks: **Spring Boot, Hibernate, Angular** sandboxes with sidecar Postgres / Redis where needed.
- **Mock interview agent** persona (timed, no hints, post-interview debrief).
- **Project-based learning** — multi-session capstone projects with milestones.
- **Frustration / confusion detection** from voice + behavioral signals → proactive difficulty drop.
- **WhatsApp notifications** via Meta Cloud API.
- **Learned difficulty model** (replaces heuristic tuner).
- **Hybrid search RAG** (BM25 + vector) over lessons + user code + official docs.
- **Capacitor mobile wrappers** for iOS and Android — same Next.js build, native plugins for mic and push only.
- **Tablet-optimized layout.**
- **Whisper STT** (cloud or self-hosted) replacing Web Speech API for voice quality.
- **Improved TTS** (ElevenLabs or comparable).
- **Learning-style assessment** informing plan generation.
- **JD parser + resume gap report** (career-aware curriculum extension).
- **Local model fallback** (Ollama) for privacy-sensitive deployments.
- **Operator dashboards** (problem-quality, prompt-eval, cost-anomaly).

### Exit criteria (v2)
- A user can run a Spring Boot or React project end-to-end inside the sandbox.
- Mock interview mode produces a credible interview transcript with debrief.
- Mobile app works offline for cached lessons and queues submissions.
- WhatsApp opt-in flow is clean and notifications respect quiet hours.

---

## Phase v3 — months 11+

Goal: **SaaS launch**, **ML / DL tracks**, **system-design teaching**, **scale**.

### Headline features
- **ML / classical-ML track** (scikit-learn, pandas).
- **Deep learning + NN-from-scratch track** (PyTorch fundamentals, math foundations, build-a-CNN, build-a-transformer).
- **"Build an LLM from scratch" capstone track** — tokenization, attention, training loop, fine-tuning.
- **System-design teaching** with diagram-based interaction.
- **Collaborative cursors** (pair programming + mentor mode).
- **Firecracker microVMs** under Linux for SaaS-scale isolation.
- **Multi-tenant SaaS launch:** orgs UI, subscription plans (free / pro / team), billing (Stripe), admin panels, usage metering.
- **Seasonal challenges** (time-bound campaigns — opt-in).
- **Salary / role-trend integration** in career-aware curriculum.
- **Custom user-defined tracks** (power users / instructors).
- **SAML / SSO for enterprise tier.**
- **Wake-word for hands-free voice.**

### Exit criteria (v3)
- LearnPro is a paying SaaS with a small but real revenue base.
- Self-hosted version remains feature-complete (no SaaS-only feature lock-in for self-hosters, except billing/multi-tenant UI).
- ML / DL tracks have ~50 problems each.

---

## Always-on workstreams (not phases)

These run continuously, not as phase milestones:

- **Content authoring** — new problems, new tracks, new lesson explanations. Probably ~30% of effort post-MVP.
- **Prompt evaluation** — keep the tutor honest as we change models, prompts, or add tools.
- **Security review** — annual sandbox audit, ongoing dependency scanning.
- **Performance & cost optimization** — model routing, embedding caching, query tuning.
- **Telemetry-driven UX iteration** — instrument, measure, fix.

---

## Versioning and release cadence

- MVP and v1 are **internal milestones**, not public releases. The repo is private (or limited-public) until v1 ships.
- v2 may publish a public source-available release under BSL.
- v3 (SaaS) launches with marketing.

---

## How scope changes happen

Scope evolves as the user has more discussions and the product gets real-world feedback. The flow:

1. New idea / requirement / feedback surfaces (in a session, in user testing, from an alpha user).
2. **It becomes a Story in `/project/`** under the right Epic, with `status: backlog` and a `phase: vN` tag.
3. This roadmap doc is updated when a meaningful chunk of new scope is added or removed (don't update for every individual Story).
4. If the change is architectural, write or update an ADR.

The board (`/project/BOARD.md`) is the *operational* truth. This doc is the *narrative* truth — what we're building over time and why.
