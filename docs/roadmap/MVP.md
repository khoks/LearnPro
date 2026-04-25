# MVP.md — Minimum Viable Product scope

> **The MVP is fixed.** Anything outside this scope goes into `project/` as a backlog Story under the relevant Epic, not into MVP code. See [`CLAUDE.md`](../../CLAUDE.md) → "The MVP gate."

---

## 1. The single loop the MVP must prove

```
user picks a track
   → tutor agent assigns a problem at calibrated difficulty
   → user codes in the browser (Monaco editor)
   → code runs in a hardened sandboxed container
   → grader returns pass/fail + feedback
   → tutor explains and updates the learner profile
   → next problem is selected harder / easier accordingly
```

If this loop works, end-to-end, with one user, in two languages, then LearnPro has product-market fit signal worth investing in. If it doesn't, no amount of voice / WhatsApp / mobile will help.

---

## 2. Target: 4–8 weeks, single developer

Rough breakdown:

- **Week 1–2:** Repo setup (`pnpm init`, Next.js, Drizzle, Docker Compose for Postgres/Redis/Piston/MinIO). Auth.js with email magic link + GitHub OAuth.
- **Week 2–3:** `LLMProvider` + Anthropic adapter, prompt registry skeleton, cost telemetry.
- **Week 3–4:** Sandbox via Piston, `SandboxProvider` interface, hardening checklist verified.
- **Week 4–5:** Onboarding flow (5 questions), profile schema, episodic log.
- **Week 5–6:** Tutor agent with tools: `assignProblem`, `giveHint` (3-rung), `grade`, `updateProfile`. Heuristic difficulty tuner.
- **Week 6–7:** Curated problem banks for Python (~30) and TypeScript (~30). Hidden-test grading.
- **Week 7–8:** XP, streak, per-track progress bar. In-app + Web Push notifications. Data export. Accessibility baseline pass. Bug bash.

Estimates assume ~25 focused hours/week. Slip is expected; the gate is "the loop works," not "everything in week N is done by Friday."

---

## 3. In scope (MVP)

### Web app
- [ ] Next.js 15 App Router, React 19, TypeScript strict.
- [ ] Tailwind + shadcn/ui base components.
- [ ] Auth.js: email magic link + GitHub OAuth.
- [ ] Single-user mode (`org_id` defaulted; multi-tenant UI off).
- [ ] Onboarding (5 questions): target role, languages known, weekly time budget, learning goal, current self-assessed level.
- [ ] Track selection screen (Python / TypeScript).
- [ ] Editor screen: Monaco + run button + test results panel + hint button (3-rung) + submit.
- [ ] Progress dashboard: XP, streak, per-track progress bar.
- [ ] Notification center (bell icon).
- [ ] Settings: quiet hours, data export, sign out.

### Tracks (content)
- [ ] **Python fundamentals** — ~30 curated problems across: variables, control flow, functions, lists, dicts, classes, file I/O, comprehensions, exceptions.
- [ ] **TypeScript fundamentals** — ~30 curated problems across: types, interfaces, generics, async/await, modules, classes, narrowing, utility types, error handling.
- [ ] Each problem: title, description, starter code, hidden test cases, reference solution, tagged concepts.

### Sandbox
- [ ] Self-hosted **Piston** in Docker on WSL2.
- [ ] `SandboxProvider` interface in `packages/sandbox`.
- [ ] Hardening checklist (see [ADR-0002](../architecture/ADR-0002-sandbox.md)) verified.
- [ ] Stdin/stdout streaming over WebSocket on `/realtime`.
- [ ] Hard limits: CPU, mem, wall-clock, output size.

### Agent harness
- [ ] `LLMProvider` interface in `packages/llm` with Anthropic adapter implemented; OpenAI + Ollama stubbed.
- [ ] Tutor agent (Claude Opus) with tools: `assignProblem`, `giveHint(rung: 1|2|3)`, `grade`, `updateProfile`.
- [ ] Prompt registry under `packages/agent/prompts/` with versioning.
- [ ] Cost telemetry on every LLM call (provider, model, tokens-in, tokens-out, latency, user-id, prompt-version).
- [ ] Per-user daily token budget with graceful degradation messaging.

### Profile
- [ ] Schema in `packages/db/schema/`: users, profiles, tracks, concepts (with skill graph foreign keys, even if unpopulated), problems, episodes (per-attempt log), hints, scores.
- [ ] Heuristic difficulty tuner: take `(time_to_solve, hint_count, error_count)` → next-problem difficulty bucket.
- [ ] Per-concept skill score updated after each episode.

### Gamification (minimal, no dark patterns)
- [ ] XP awarded per problem (less for hints used).
- [ ] Daily streak counter with **3 grace days per month**.
- [ ] Per-track progress bar (% of curated problems passed).
- [ ] **No leaderboards in MVP. No FOMO push. No loss-aversion.**

### Notifications
- [ ] In-app notification center.
- [ ] Browser Web Push (VAPID).
- [ ] User-configurable quiet hours (default 22:00–08:00 local).
- [ ] Daily reminder at user-chosen time (single nudge, dismissible).

### Cross-cutting
- [ ] JSON data export endpoint (profile + episodes).
- [ ] Accessibility baseline: full keyboard navigation, ARIA labels on Monaco, focus-visible styles, color-contrast >=AA.
- [ ] Cost/latency telemetry visible in a `/admin/telemetry` page (single-user, behind auth).

### Infrastructure (dev-only)
- [ ] `docker-compose.yml` spinning up Postgres + pgvector + Redis + Piston + MinIO.
- [ ] `scripts/windows/bootstrap.ps1` to set up the dev env from a fresh Windows + WSL2.

---

## 4. Out of scope (MVP)

Explicitly **not** in MVP — these are real features and they will land, but not now:

- Voice (push-to-talk, STT, TTS, frustration detection) — **all v1 or later**.
- Languages: Go, Rust, Java, Kotlin, C — **v1**.
- Frameworks: Spring Boot, Hibernate, Angular, React (sandbox templates) — **v1 (React) / v2 (others)**.
- Multi-file project workspaces — **v1**.
- Mobile (PWA install, Capacitor) — **v1 (PWA) / v2 (native wrapper)**.
- WhatsApp / SMS notifications — **v2**.
- Email digests — **v1**.
- ML / DL / "build an LLM from scratch" tracks — **v2 / v3**.
- Mock interviews, project-based learning — **v2**.
- Knowledge graph populated end-to-end — **v1** (schema is in MVP, content is v1).
- Spaced-repetition (FSRS) — **v1** (a basic review queue may sneak into MVP if cheap).
- Anti-cheat / honesty mode — **v1**.
- Debugging / "read this code" exercises — **v1**.
- GitHub portfolio integration — **v1**.
- Cheatsheet auto-generation — **v1**.
- Pomodoro / break reminders — **v1**.
- Learned (vs. heuristic) difficulty model — **v2**.
- RAG over external docs — **v1**.
- Multi-tenant SaaS (orgs UI, billing, subscriptions) — **v3**.

---

## 5. Definition of "MVP done"

The MVP is shipped when:

1. A new user can sign up, complete onboarding, pick a track, and successfully solve at least 5 problems with adaptive difficulty.
2. The tutor agent gives meaningful hints across all 3 rungs without breaking, and the difficulty tuner visibly responds to the user's performance.
3. The sandbox passes a documented security checklist (see [ADR-0002](../architecture/ADR-0002-sandbox.md)) and an attempted breakout exercise (e.g., trying to `import socket; socket.socket().connect(('1.1.1.1', 80))` in Python is blocked).
4. The user can export their data as JSON and the export contains everything they did.
5. End-to-end Playwright test of the loop passes.
6. README and CLAUDE.md are updated to reflect the running app (run commands, env setup, troubleshooting).

When all six are true, the MVP is real. Then we open it to a small alpha cohort (5–10 trusted users) before starting v1.
