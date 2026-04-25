# RECOMMENDED_ADDITIONS.md — feature idea catalog

This is the master catalog of feature ideas that aren't in [`RAW_VISION.md`](./RAW_VISION.md) but are surfaced for visibility. Each is justified, sized, and given a phase tag.

**Lifecycle:** Ideas live here as proposals. The strongest are promoted to Stories in [`/project/stories/`](../../project/stories/) when they (a) reinforce the differentiators in [`docs/product/DIFFERENTIATORS.md`](../product/DIFFERENTIATORS.md), (b) are concrete enough to estimate, and (c) can be started within v1 or v2. Promoted ideas show their `STORY-NNN` link in the **Filed** column.

**Source documents this catalog references:**
- [`docs/product/DIFFERENTIATORS.md`](../product/DIFFERENTIATORS.md) — the wedge and the 8 differentiators an idea must reinforce
- [`docs/product/COMPETITIVE.md`](../product/COMPETITIVE.md) — how each idea compares to competitor offerings
- [`docs/product/UX_DETAILS.md`](../product/UX_DETAILS.md) — the per-epic UX deep-dive that locks the *how*

---

## Reading legend

| Field | Meaning |
|---|---|
| **Phase** | mvp / v1 (months 3–5) / v2 (months 6–10) / v3 (months 11+) |
| **Epic** | Which epic it lives under (or "new" if it might warrant a new epic) |
| **Filed?** | Linked Story ID if this is a committed backlog item; "—" if it's still a half-baked idea |
| **Differentiator reinforced** | Which `DIFFERENTIATORS.md` § this strengthens (none = nice-to-have, may be cut) |

---

## High-leverage adds (recommended for MVP or v1)

These are the ideas with the strongest case. Most are filed as Stories.

### Spaced repetition (FSRS algorithm)
- **Phase:** v1 | **Epic:** EPIC-005 | **Filed?** [STORY-031](../../project/stories/STORY-031-fsrs-spaced-repetition.md) | **Differentiator:** §1 Genuinely adaptive
- "Skill decay prevention" (in the user's stated goals) is just notifications without an actual repetition algorithm. FSRS — Free Spaced Repetition Scheduler — outperforms classical SM-2 by modeling per-item memory decay parameters. Schedules concept reviews based on how recently each was practiced and how confidently. Cost: ~3 days for the algorithm + scheduler; data model is just a few columns on the profile.

### Knowledge graph populated with 200+ concepts
- **Phase:** v1 | **Epic:** EPIC-005 | **Filed?** [STORY-032](../../project/stories/STORY-032-knowledge-graph-population.md) | **Differentiator:** §1, §2
- Schema lands in MVP, but the graph isn't useful until populated with real concept-prerequisite edges. v1 work: enumerate ~200 concepts across Python + TS + DSA + framework basics, encode prerequisite edges, validate by simulating a learner walking the graph. This is what makes "the user is failing React hooks → check JS closures first" actually work.

### Profile-update agent (async)
- **Phase:** v1 | **Epic:** EPIC-004 | **Filed?** [STORY-033](../../project/stories/STORY-033-profile-update-agent.md) | **Differentiator:** §2 Profile that knows you
- Today's MVP plan: tutor agent updates profile inline. v1 split: a separate async agent reads the day's episodes and synthesizes higher-level traits ("user struggles with mutability boundaries — same root cause manifests in 4 different problem types this week"). Reduces tutor latency, produces deeper insight.

### Critique / grader agent (split from tutor)
- **Phase:** v1 | **Epic:** EPIC-004 | **Filed?** [STORY-034](../../project/stories/STORY-034-critique-agent-split.md) | **Differentiator:** §1, §5 (anti-autocomplete pedagogy)
- The tutor is biased to be encouraging — it's bad at honest negative grading. Splitting the grader into a separate agent (cooler tone, scored against rubrics) reduces this bias and produces more accurate skill scores. Two-agent pattern is well-established (cf. critic/actor in RL).

### Prompt eval harness on PRs
- **Phase:** v1 | **Epic:** EPIC-004 | **Filed?** [STORY-035](../../project/stories/STORY-035-prompt-eval-harness.md) | **Differentiator:** §1, §2
- Without a regression test for prompts, every prompt change is a coin flip. Build a small canned-student-transcript set (~50 cases): wrong code, correct-but-inefficient, "I'm stuck" frustration, etc. Each PR runs prompt changes against this set and shows scored diffs. Prevents subtle pedagogy drift. Cost: ~1 week.

### Local model fallback (Ollama)
- **Phase:** v1 | **Epic:** EPIC-004 | **Filed?** [STORY-036](../../project/stories/STORY-036-ollama-fallback.md) | **Differentiator:** §4 Self-hosted-first, §8 Provider-abstracted brain
- Ollama adapter is stubbed in MVP; v1 wires it up and validates with a 7B / 14B model. Critical for the privacy-conscious self-host audience. Performance is significantly worse than Claude — this is for users who explicitly want offline. UX: a "tutor mode" toggle in settings (Cloud / Local / Auto-fallback).

### Debugging exercises engine
- **Phase:** v1 | **Epic:** EPIC-007 | **Filed?** [STORY-037](../../project/stories/STORY-037-debugging-exercises.md) | **Differentiator:** §5 Anti-autocomplete pedagogy
- Reading and fixing broken code is closer to real engineering than greenfield problem-solving. Almost no learning platform does this. Provide intentionally-buggy code (4–6 different bug archetypes per language: off-by-one, mutation in iteration, reference equality, async race, etc.), ask user to find and fix. Engine reuses the existing problem framework; content is the lift.

### "Read this code" comprehension exercises
- **Phase:** v1 | **Epic:** EPIC-007 | **Filed?** [STORY-038](../../project/stories/STORY-038-read-this-code-exercises.md) | **Differentiator:** §5
- Reading is 80% of real engineering work. Comprehension exercises ("what does this function return for input X?", "what's the time complexity?", "where would you add caching?", "what's the bug here?") test a different skill axis than producing code. Big differentiator vs. all problem-grinder competitors.

### LLM-generated problem variants
- **Phase:** v1 | **Epic:** EPIC-007 | **Filed?** [STORY-039](../../project/stories/STORY-039-llm-problem-variants.md) | **Differentiator:** §1
- Curated bank in MVP gives ~30 problems per language. Variants extend that to many more by asking the LLM to produce same-shape, different-domain rephrasings (same algorithm, different cover story). Variants pass through a curated test of: spec-clarity, hidden-test correctness, novelty. Cost: ~1 week of pipeline work + ongoing per-variant LLM cost.

### GitHub portfolio integration
- **Phase:** v1 | **Epic:** EPIC-013 (or could spin out as new "Integrations" epic) | **Filed?** [STORY-040](../../project/stories/STORY-040-github-portfolio.md) | **Differentiator:** §2 (their work lives outside our app, sticky)
- Auto-push completed multi-session projects to a `learnpro-portfolio` repo on the user's GitHub. Sticky (their work lives outside our app), shareable (recruiters can see it), retention-positive. OAuth flow already exists from Auth.js. Cost: ~1 week including OAuth scopes, repo creation, README templating.

### Personal cheatsheet auto-generation
- **Phase:** v1 | **Epic:** EPIC-002 | **Filed?** [STORY-041](../../project/stories/STORY-041-cheatsheet-generator.md) | **Differentiator:** §2
- After each session, generate a personalized cheatsheet ("things you struggled with today, summarized as flashcards"). User can export to PDF, print, stick on the wall. Boosts retention via spaced re-reading and produces a tangible take-home. Cost: ~3 days; LLM-driven summarization with a fixed template.

### Anti-cheat v1 — paste detection + "I got help" toggle
- **Phase:** v1 | **Epic:** EPIC-016 | **Filed?** [STORY-042](../../project/stories/STORY-042-anti-cheat-v1.md) | **Differentiator:** §2
- MVP only logs `paste_ratio` silently. v1 adds: (a) explicit paste-detect modal ("looks like you pasted — was this your code, or do you want to mark it as 'got help'?"), (b) honest-default `I got help` toggle in result panel. Never accusatory. Pairs with profile weight that "got help" episodes don't count toward concept mastery. Cost: ~1 week.

### Multi-file workspaces
- **Phase:** v1 | **Epic:** EPIC-003 | **Filed?** [STORY-043](../../project/stories/STORY-043-multi-file-workspaces.md) | **Differentiator:** §3 Real sandbox
- MVP is single-file solve. v1 needs multi-file because real engineering is multi-file. Add a virtual filesystem in the sandbox container, file-tree sidebar in the UI, language-aware module/import resolution. Required for framework starters (React, Express, etc.) which depend on this.

### PWA — manifest, service worker, offline shell
- **Phase:** v1 | **Epic:** EPIC-013 | **Filed?** [STORY-044](../../project/stories/STORY-044-pwa-baseline.md) | **Differentiator:** §4 Self-hosted-first (offline-friendly is a corollary)
- MVP is responsive web. PWA adds installability ("add to home screen"), offline shell (dashboard + profile cached, editor disabled when offline), service worker for queuing pending submissions. Cost: ~1 week — manifest + service worker + offline UI.

### Email digest notifications
- **Phase:** v1 | **Epic:** EPIC-012 | **Filed?** [STORY-045](../../project/stories/STORY-045-email-digests.md) | **Differentiator:** §7 Anti-dark-pattern (digest format is opt-in, no FOMO)
- Daily / weekly summary emails via Resend or Postmark. Daily: "yesterday you solved 3 problems, mastered list comprehensions, and your tomorrow's plan is X." Weekly: "this week you closed N concepts, total time M hours." Opt-in, with full unsubscribe. Cost: ~3 days.

### Daily and weekly plan views
- **Phase:** v1 | **Epic:** EPIC-006 | **Filed?** [STORY-046](../../project/stories/STORY-046-daily-weekly-plans.md) | **Differentiator:** §6 Multi-horizon planning
- MVP only has session plan. v1 adds: dashboard "today's plan" (review queue + new material) + dashboard "this week" (themed: e.g., "React state management week"). Cost: ~1 week — most of the work is the planning agent prompt + UI.

### Mock interviewer agent persona
- **Phase:** v2 | **Epic:** EPIC-004 (could split out as new EPIC-018 mock-interview if scope grows) | **Filed?** [STORY-047](../../project/stories/STORY-047-mock-interviewer-agent.md) | **Differentiator:** §2 Profile that knows you
- A separate "interviewer" agent persona: timed problems, neutral demeanor, no hints, post-interview debrief with "what you'd want to say differently in a real interview." Major willingness-to-pay signal for SaaS phase — interview prep is a $500+ product category. Cost: ~2 weeks.

### Project-based learning — multi-session projects
- **Phase:** v2 | **Epic:** EPIC-007 (could spin out as new EPIC-019 project-learning) | **Filed?** [STORY-048](../../project/stories/STORY-048-project-based-learning.md) | **Differentiator:** §2, §6
- "Build a CLI todo app over 4 sessions," "build a tiny Twitter clone over 2 weeks." Multi-session, milestone-based. Pairs with GitHub portfolio integration. What converts skill into portfolio. Cost: ~3 weeks for the milestone engine + 1 starter project.

### Capacitor mobile wrapper (iOS + Android)
- **Phase:** v2 | **Epic:** EPIC-013 | **Filed?** [STORY-049](../../project/stories/STORY-049-capacitor-mobile.md) | **Differentiator:** §4 (cross-platform without rewrite)
- Wraps the existing Next.js + PWA build with Capacitor for app-store distribution. Native plugins only for mic + push. Editor remains desktop-recommended; mobile app is for dashboard, profile, recap, light review tasks. Cost: ~3 weeks including App Store / Play Store submission ceremony.

### WhatsApp notifications via Meta Cloud API
- **Phase:** v2 | **Epic:** EPIC-012 | **Filed?** [STORY-050](../../project/stories/STORY-050-whatsapp-notifications.md) | **Differentiator:** §7 (humane channel choice)
- The user's vision specifically calls for WhatsApp. Meta Cloud API (not Twilio) is the cheapest path. Requires business verification + template approval ceremony. Used for daily reminder + weekly recap only — no engagement spam. Cost: ~2 weeks including verification + ops.

### Telemetry on the tutor itself + eval harness
- **Phase:** Instrumentation in MVP (covered by [STORY-012](../../project/stories/STORY-012-cost-telemetry.md)); full eval in v1 (covered by [STORY-035](../../project/stories/STORY-035-prompt-eval-harness.md))
- "Adaptive" without measurement is vibes. Per-call telemetry: cost, latency, hint rung used, did the user solve after the hint, did they regress. Eval harness tests prompt changes against canned student transcripts. **Without this, you cannot ship a v2 tutor with confidence.**

### GDPR-style data export
- **Phase:** MVP (covered by [STORY-026](../../project/stories/STORY-026-data-export.md))
- Trivial day-1, expensive to retrofit.

### Accessibility baseline
- **Phase:** MVP baseline (covered by [STORY-027](../../project/stories/STORY-027-accessibility-baseline.md)); v1 audit
- Keyboard nav, screen-reader labels on Monaco, captions for any audio. Hard to retrofit; cheap up front.

### Pomodoro / break reminders
- **Phase:** v1 | **Epic:** EPIC-011 | **Filed?** — (idea catalog only; small enough to do anytime)
- Eye-strain reminder, posture nudge, "you've coded 90 min, take a 10-min walk." Protects users *from* over-engaged learning. Cost: ~1 day.

---

## Catalog by Epic

The remaining ideas are organized by their owning Epic. Most are *not yet filed* as Stories — they're inventory for v1/v2/v3 grooming sessions.

### EPIC-002 — MVP loop (extensions)

| Idea | Phase | Filed? | Notes |
|---|---|---|---|
| Coach Mode — explicit "today we focus on X because Y" framing at session start | v1 | — | Strengthens the "knows you" feel; reuses session-plan agent |
| Session pause/resume across devices (start on laptop, finish on tablet) | v1 | — | Storage already there; UI work |
| "Replay" — watch a playback of your own session (typing animation + tutor messages) | v2 | — | Cute, retention-positive, may be too cute — A/B test |
| Personal cheatsheet auto-generation (see High-leverage above) | v1 | [STORY-041](../../project/stories/STORY-041-cheatsheet-generator.md) | |

### EPIC-003 — Sandbox (extensions)

| Idea | Phase | Filed? | Notes |
|---|---|---|---|
| Multi-file workspaces (see High-leverage) | v1 | [STORY-043](../../project/stories/STORY-043-multi-file-workspaces.md) | |
| Framework starter templates (React, Express, FastAPI) | v1 | — | Depends on multi-file workspaces |
| Database-attached sandboxes (Postgres, SQLite) | v2 | — | For backend lessons; significant infra |
| REPL mode (interactive Python/TS shell) | v2 | — | Pairs with notebook-style cells |
| Notebook-style cells (Jupyter-like) for data lessons | v2 | — | Foundation for ML track in v3 |
| Browser-rendered output for HTML/React problems (preview pane) | v2 | — | Required for Frontend tracks |
| Diff-against-reference visualization (after solve, "your code vs idiomatic") | v1 | — | Tutor commentary already does this in prose; visual diff is the cherry on top |

### EPIC-004 — Tutor agent (extensions)

| Idea | Phase | Filed? | Notes |
|---|---|---|---|
| Profile-update agent (see High-leverage) | v1 | [STORY-033](../../project/stories/STORY-033-profile-update-agent.md) | |
| Critique/grader agent split (see High-leverage) | v1 | [STORY-034](../../project/stories/STORY-034-critique-agent-split.md) | |
| Prompt eval harness (see High-leverage) | v1 | [STORY-035](../../project/stories/STORY-035-prompt-eval-harness.md) | |
| Local model fallback via Ollama (see High-leverage) | v1 | [STORY-036](../../project/stories/STORY-036-ollama-fallback.md) | |
| Mock interviewer agent (see High-leverage) | v2 | [STORY-047](../../project/stories/STORY-047-mock-interviewer-agent.md) | |
| "Why am I stuck?" reflection agent | v1 | — | Synthesizes "your last 5 stuck moments share this concept gap" |
| Code-review persona (peer reviewer, not tutor) | v2 | — | Different tone; strengthens variety |
| Tutor "memory peek" page — show user what's in their profile, with deletes | v2 | — | Trust-building; "you own your data" feel |
| Dynamic tone matching (terse for advanced users; explanatory for beginners) | v2 | — | Inferred from skill confidence; risky if mis-calibrated |
| Multi-LLM routing (Haiku for grading, Opus for tutoring, Sonnet for hints) | v2 | — | Cost-optimization; needs profiling first |
| Tutor "quote me on something I taught you yesterday" recall | v2 | — | Builds memory illusion; cheap with episodic vectors |

### EPIC-005 — Learner profile & memory (extensions)

| Idea | Phase | Filed? | Notes |
|---|---|---|---|
| FSRS spaced repetition (see High-leverage) | v1 | [STORY-031](../../project/stories/STORY-031-fsrs-spaced-repetition.md) | |
| Knowledge graph population (see High-leverage) | v1 | [STORY-032](../../project/stories/STORY-032-knowledge-graph-population.md) | |
| Decay model for non-practiced concepts | v1 | — | Folds into FSRS work; not separately filed |
| "Skill snapshot" comparison over time (where I was 3 months ago vs now) | v2 | — | Retention feature; show growth visually |
| Per-language confidence isolation (Python iteration ≠ TS iteration) | v1 | — | Schema already supports this; surfacing is the work |
| Concept search ("show me all problems I've done on closures") | v1 | — | Useful for review; uses pgvector |
| User-configurable "reset concept" button | v2 | — | Honesty mode; sets skill to 0 with reason |

### EPIC-006 — Multi-horizon planning (extensions)

| Idea | Phase | Filed? | Notes |
|---|---|---|---|
| Daily and weekly plan views (see High-leverage) | v1 | [STORY-046](../../project/stories/STORY-046-daily-weekly-plans.md) | |
| Mastery roadmap (3–12 month plan to a target role) | v2 | — | Long-arc view; pairs with career epic |
| Calendar / iCal export of planned sessions | v2 | — | For users who time-block |
| "What did I do today?" auto-recap | v1 | — | Already in end-of-session UX (see UX_DETAILS § EPIC-002); not separately filed |
| Re-planner detecting falling-behind / accelerating | v2 | — | Adjusts plan dynamically |
| Calendar-aware scheduling (skip sessions on busy work days) | v2 | — | Requires calendar integration; opt-in |

### EPIC-007 — Adaptive problems & grading (extensions)

| Idea | Phase | Filed? | Notes |
|---|---|---|---|
| Debugging exercises (see High-leverage) | v1 | [STORY-037](../../project/stories/STORY-037-debugging-exercises.md) | |
| "Read this code" exercises (see High-leverage) | v1 | [STORY-038](../../project/stories/STORY-038-read-this-code-exercises.md) | |
| LLM-generated variants (see High-leverage) | v1 | [STORY-039](../../project/stories/STORY-039-llm-problem-variants.md) | |
| Open-ended problems graded by LLM rubric | v1 | — | Higher difficulty surface; needs eval harness |
| Refactoring exercises (working code → make it idiomatic/efficient) | v2 | — | Variant of debugging; different mode |
| Time-complexity questions (here's code, what's the complexity?) | v1 | — | Folds into "read this code" engine |
| "Predict the bug" exercises (here's code that crashes — predict why before running) | v2 | — | Sharpens reasoning; novel format |
| Difficulty calibration dashboard (operator view) | v2 | — | Internal tool; informs MVP heuristic-tuner replacement |
| Code-golf challenges (opt-in, fun mode) | v2 | — | Lightweight; for variety |
| Project-based learning (see High-leverage) | v2 | [STORY-048](../../project/stories/STORY-048-project-based-learning.md) | |
| Test-writing exercises ("here's a function spec, write the tests") | v1 | — | Inverts the usual loop; high-leverage skill |

### EPIC-008 — Voice tutor (deferred to v1)

| Idea | Phase | Filed? | Notes |
|---|---|---|---|
| Push-to-talk Web Speech baseline | v1 | — | Cheap first cut; doesn't need cloud STT |
| Whisper STT for accuracy | v1 | — | After Web Speech proves the loop |
| TTS for tutor responses (with stop button) | v1 | — | Optional; some users prefer reading |
| Frustration detection from prosody | v2 | — | Hard; needs real data |
| Voice-mode quiet hours (don't speak during configured times) | v1 | — | Trivial; do it day-1 of voice |
| "Hands-free coding mode" — voice commands for editor | v2 | — | Niche; defer until usage data |

### EPIC-009 — Learning tracks (extensions)

| Idea | Phase | Filed? | Notes |
|---|---|---|---|
| DSA track (cross-language) | v1 | — | Heavy content lift; foundational for v2 ML track |
| Framework tracks (React, Express, FastAPI, Spring) | v2 | — | Each is a 2–3 week content effort |
| Classical ML track (scikit-learn, pandas) | v2 | — | Major content + sandbox extensions |
| Deep learning + NN-from-scratch track (PyTorch + math foundations) | v3 | — | The "build an LLM from scratch" capstone |
| System design teaching track | v3 | — | Hard to grade; may need different format |
| User-defined custom tracks (power users / instructors) | v2 | — | YAML editor + share URL |
| Multi-language interleaved tracks (e.g., "fullstack TS + Python") | v2 | — | Niche but desired; minor work |
| Track marketplace (community-published) | v3 | — | Moderation cost; defer |
| Industry-specific tracks (fintech, healthcare, etc.) | v3 | — | Vertical play; commercially attractive |

### EPIC-010 — Career-aware curriculum (extensions)

| Idea | Phase | Filed? | Notes |
|---|---|---|---|
| Job description parser (paste a JD → gap analysis) | v2 | — | Big "wow" demo for SaaS; LLM does heavy lifting |
| Resume / portfolio gap report | v2 | — | Pairs with JD parser + GitHub portfolio |
| Salary / role-trend integration | v3 | — | External data; nice-to-have |
| Mock interview circuits per role (frontend, backend, ML, etc.) | v2 | — | Folds into mock interviewer agent (STORY-047) |
| Role library expansion (50+ roles) | v2 | — | Content effort; partner with industry data |

### EPIC-011 — Gamification (extensions)

| Idea | Phase | Filed? | Notes |
|---|---|---|---|
| Concept badges (earned by passing rubric thresholds) | v1 | — | Subtle, monochrome; not "trophy unlock" |
| Pomodoro / break reminders | v1 | — | (See High-leverage; small enough to skip filing) |
| Skill heatmap visualization (already in EPIC-005 profile UX) | v1 | — | Pairs with "skill snapshot over time" |
| Opt-in private cohort leaderboards (small group invite only) | v2 | — | Avoids public-shame trap; opt-in is the trick |
| Seasonal challenges (time-bound, opt-in only — no FOMO copy) | v3 | — | Opt-in toggle hidden in settings |
| Level system | v2 | — | Add only with measurement; risk of grind pressure |
| Skill-tree visualization (game-style branching) | v2 | — | Polished version of heatmap; cosmetic |

### EPIC-012 — Notifications (extensions)

| Idea | Phase | Filed? | Notes |
|---|---|---|---|
| Email digests (see High-leverage) | v1 | [STORY-045](../../project/stories/STORY-045-email-digests.md) | |
| WhatsApp via Meta Cloud API (see High-leverage) | v2 | [STORY-050](../../project/stories/STORY-050-whatsapp-notifications.md) | |
| Smart re-engagement (FSRS-driven, not blanket) | v2 | — | Pairs with FSRS work |
| Mobile push (post-Capacitor, native) | v2 | — | Capacitor wraps Web Push fine; native push is later |
| Calendar-aware scheduling | v2 | — | Avoid notifications during busy hours |
| SMS fallback | v3 | — | Cost + spam-filter; defer indefinitely |

### EPIC-013 — Cross-platform (extensions)

| Idea | Phase | Filed? | Notes |
|---|---|---|---|
| PWA — manifest, service worker, offline shell (see High-leverage) | v1 | [STORY-044](../../project/stories/STORY-044-pwa-baseline.md) | |
| Capacitor mobile wrapper (see High-leverage) | v2 | [STORY-049](../../project/stories/STORY-049-capacitor-mobile.md) | |
| Tablet-optimized layout (larger touch targets, side-by-side panels) | v2 | — | Good for iPad-with-keyboard users |
| Read-only mobile editor (view code on phone for review) | v2 | — | Lighter than full mobile editor |
| GitHub portfolio integration (see High-leverage; lives here for now) | v1 | [STORY-040](../../project/stories/STORY-040-github-portfolio.md) | |
| VS Code extension (today's problems in editor sidebar) | v2 | — | Lightweight; reaches users where they are |
| JetBrains plugin | v3 | — | Same idea; smaller audience for our content focus |
| GitHub Actions integration (auto-run problems on PR for OSS contributions track) | v3 | — | Niche but cool |
| CLI client (`learnpro session start`) for offline-friendly users | v2 | — | Self-host audience may want this |

### EPIC-014 — RAG / agent memory

| Idea | Phase | Filed? | Notes |
|---|---|---|---|
| RAG over lessons + user code + curated docs | v1 | — | Foundational v1 work; not separately filed yet (lives in EPIC-014) |
| Hybrid search (BM25 + dense pgvector) | v1 | — | Pairs with the RAG work above |
| "Find me a similar problem I've done" | v1 | — | Uses episode embeddings |
| Personal docs ingestion (paste your own notes; tutor uses them) | v2 | — | Power-user feature |
| Long-term memory consolidation (LLM summarizes profile periodically) | v2 | — | Reduces context bloat |

### EPIC-015 — SaaS readiness (extensions)

| Idea | Phase | Filed? | Notes |
|---|---|---|---|
| Multi-user invites / orgs UI | v3 | — | SaaS launch work |
| Subscription plans + Stripe billing | v3 | — | SaaS launch work |
| Admin panel (user mgmt, support tooling) | v3 | — | SaaS launch work |
| SSO/SAML for enterprise | v3 | — | Enterprise tier; defer until demand |
| Usage metering & quotas (paid plan limits) | v3 | — | Pairs with billing |
| Feature flags via GrowthBook (self-hosted) | v3 | — | Plan-gating; pairs with billing |
| Multi-region deploy (SaaS) | v3 | — | EU compliance + latency |

### EPIC-016 — Security & anti-cheat (extensions)

| Idea | Phase | Filed? | Notes |
|---|---|---|---|
| Anti-cheat v1 (see High-leverage) | v1 | [STORY-042](../../project/stories/STORY-042-anti-cheat-v1.md) | |
| Honesty mode — paste-lock during practice problems (opt-in) | v2 | — | Builds on anti-cheat v1 |
| 2FA support | v1 | — | Cheap; do it whenever auth is touched again |
| Periodic security audit cadence (quarterly) | v2 | — | Ops process, not code |
| Dependency scanning in CI | v1 | — | One-line GitHub Actions config |
| Audit logs (SaaS) | v3 | — | Enterprise tier requirement |
| Active session management UI ("log out other devices") | v1 | — | Standard, expected |

---

## Cross-cutting ideas (no specific Epic owner yet)

These don't fit neatly under existing epics. Some may warrant new epics in v2/v3 grooming.

| Idea | Phase | Notes |
|---|---|---|
| Anonymous public profile page (opt-in shareable URL) | v2 | "Look at my LearnPro" — sharable proof of progress |
| Open-source contribution mode (problems sourced from real OSS issues) | v3 | Authentic "real engineering"; legal review needed |
| "Industry case study" track (real engineering problems from real companies) | v3 | Differentiation play; partnership-driven |
| Curriculum import/export (share a track .yaml) | v2 | Foundation for marketplace |
| "Compare to peer" anonymized stats (opt-in) | v2 | Cohort feel without leaderboard pressure |
| Concept-of-the-day deep-dive (longer-than-usual session, optional) | v2 | For users who want depth on a Saturday |
| "Reset concept" button for honest learners (already in EPIC-005 list) | v2 | Trust-building |
| Slack/Discord status bot ("today rahul solved 4 problems") for cohorts | v3 | Pairs with opt-in cohort leaderboards |
| Integration with existing learning platforms (sync from Coursera/Pluralsight as sources) | v3 | If users complete external content, give credit |

---

## Explicitly de-prioritized (chose NOT to recommend)

These are surfaced to make the *no* explicit, so they don't keep coming up.

| Feature | Why not |
|---|---|
| Certifications | Low credibility without industry accreditation; legal/regulatory complexity. We're not Coursera. |
| Public social feed / forums | Moderation cost dwarfs the engagement benefit at our stage. Discord exists for community. |
| Mentor matching marketplace | Two-sided market problem; not the right business shape pre-SaaS |
| 3D / VR / avatar features | Massive scope, low ROI vs. the core loop. Engineering aesthetic. |
| AI-generated voice cloning of "famous teachers" | Legal + ethical minefield. Bypass. |
| Crypto / NFT badges | No. |
| Public-by-default leaderboards | Anti-pattern per [`DIFFERENTIATORS.md § 7`](../product/DIFFERENTIATORS.md). Opt-in cohort only. |
| Daily "lives" lost on failure (Duolingo) | Punishes practice. Anti-pedagogy. Refused. |
| Streak buy-back with money | Monetization-as-coercion. No. |
| Auto-friending / contact-list scraping | Privacy-hostile. |
| Email re-engagement spam ("we miss you!") | Trains "delete from inbox," loses the channel. |
| In-app modal popups for "new feature!" announcements | Hostile to focused work. Quiet changelog page is fine. |
| Aggressive screenshot detection / anti-screenshare | Privacy-invasive and unhelpful. The honest user doesn't need policing. |
| Hardware-based attestation | Overkill for the threat model. |
| Native desktop apps (Electron / Tauri) | Browser is fine; ops cost not justified. |
| Apple Watch / wearable companion | No coding happens on a watch. |
| Smart-TV apps | No. |
| AI tutor with a name and a face / avatar | Anthropomorphizing oversells the AI; engineering audience prefers the tool to feel like a tool. |
| "Coding bootcamp" branding | Wrong audience signal; bootcamps target a different demo. |

---

## How these are tracked

Ideas marked **Filed?** with a `STORY-NNN` link have a real Story file in [`project/stories/`](../../project/stories/) — they're committed to a phase and visible on [`project/BOARD.md`](../../project/BOARD.md).

Ideas marked **Filed? —** are inventory for future grooming sessions. They live in this catalog as a write-once-read-many "we considered this" record. Promote one to a Story when:

1. It reinforces a current differentiator (or extends one we want to deepen).
2. It's specific enough to estimate (not "make tutor better" but "tutor remembers user's last 5 stuck moments and surfaces them on hint rung 3").
3. Someone could start work on it within v1 or v2 (deeper-future ideas stay in the catalog).

When a v1/v2/v3 phase begins, run a grooming session against this file: promote the relevant ideas, mark them filed, and update the catalog.

---

## Catalog inventory

| Epic | Total ideas catalogued | Filed as Stories |
|---|---|---|
| EPIC-002 (MVP loop) | 4 | 1 |
| EPIC-003 (Sandbox) | 7 | 1 |
| EPIC-004 (Tutor agent) | 11 | 5 |
| EPIC-005 (Profile) | 7 | 2 |
| EPIC-006 (Planning) | 6 | 1 |
| EPIC-007 (Problems) | 11 | 4 |
| EPIC-008 (Voice) | 6 | 0 |
| EPIC-009 (Tracks) | 9 | 0 |
| EPIC-010 (Career) | 5 | 0 |
| EPIC-011 (Gamification) | 7 | 0 |
| EPIC-012 (Notifications) | 6 | 2 |
| EPIC-013 (Cross-platform) | 9 | 3 |
| EPIC-014 (RAG/Memory) | 5 | 0 |
| EPIC-015 (SaaS readiness) | 7 | 0 |
| EPIC-016 (Security/anti-cheat) | 7 | 1 |
| Cross-cutting | 9 | 0 |
| **Total** | **116** | **20** |

**(20 stories filed as STORY-031 through STORY-050.)**
