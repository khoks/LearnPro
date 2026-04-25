# RECOMMENDED_ADDITIONS.md — features the user didn't mention but probably needs

This document covers features that aren't in [`RAW_VISION.md`](./RAW_VISION.md) but which are needed (or strongly advisable) for LearnPro to actually deliver on its adaptive-tutor promise. Each is justified, sized, and given a phase tag.

These are **proposals** — surfaced for visibility. They become Stories in [`/project/`](../../project/) only when explicitly accepted.

---

## High-leverage adds (recommended for MVP or v1)

### Spaced repetition (FSRS algorithm)
- **Phase:** MVP-light (review queue), full FSRS in v1
- **Why:** "Skill decay prevention" is one of the user's stated goals. Without an actual repetition algorithm, that goal is just notifications. With FSRS, you have a real retention engine that schedules concept reviews based on memory-decay modeling. Outperforms classical SM-2.
- **Cost:** ~3 days for the algorithm + scheduler; data model is just a few columns on the profile.

### Hint laddering with XP cost
- **Phase:** MVP
- **Why:** Without a cost, the LLM tutor over-helps and the difficulty tuner gets noisy signal. Each hint rung (nudge → conceptual → near-solution) costs progressively more XP. This *is* a signal — frequent rung-3 hits = drop difficulty; rare hint use = raise it.
- **Cost:** ~2 days, mostly UI + accounting.

### Knowledge graph / prerequisite mapping
- **Phase:** Schema in MVP, populated in v1
- **Why:** "Adaptive planning" without a prerequisite model is hand-wavy. The graph lets the tuner say "user is failing at React hooks → check if they understand JS closures first → if no, branch back." Model the schema in MVP so v1 work doesn't need a migration.
- **Cost:** Schema ~1 day; populating with 200 concepts is steady multi-week content work.

### Anti-cheat / honesty mode
- **Phase:** v1
- **Why:** If the user pastes LLM answers from another tab, the profile becomes garbage and "adaptive" stops being adaptive. Detect via paste events, keystroke entropy/timing, and time-on-task heuristics. Ask the user (gently) to mark the work as "I got help" rather than punishing.
- **Cost:** ~1 week; mostly client-side instrumentation + a small classifier.

### Debugging & refactoring exercises
- **Phase:** v1
- **Why:** Reading and fixing broken code is closer to real engineering than greenfield problem-solving. Almost no learning platform does this — strong differentiator. Provide intentionally-buggy code, ask user to find and fix.
- **Cost:** Mostly content authoring; engine reuses the existing problem framework.

### "Read this code" exercises
- **Phase:** v1
- **Why:** Reading is 80% of real engineering work. Comprehension-based exercises ("what does this function return for input X?", "what's the time complexity?", "where would you add caching?") test a different skill axis. Big differentiator.
- **Cost:** Content-heavy; tooling is light.

### GitHub portfolio integration
- **Phase:** v1
- **Why:** Auto-push completed multi-session projects to a `learnpro-portfolio` repo on the user's GitHub. Sticky (their work lives outside our app), shareable (recruiters can see it), retention-positive (they look at us less but come back to ship).
- **Cost:** ~1 week including OAuth, repo creation, README templating.

### Cheatsheet / personal notes auto-generation
- **Phase:** v1
- **Why:** Users love artifacts they can keep. Generate a personalized cheatsheet from each session ("things you struggled with today, summarized"). Boosts retention via spaced re-reading and produces a take-home.
- **Cost:** ~3 days; LLM-driven summarization with a fixed template.

### Telemetry on the tutor itself + eval harness
- **Phase:** Instrument from MVP; full eval in v1
- **Why:** "Adaptive" without measurement is vibes. Instrument every prompt: cost, latency, hint rung used, did the user solve after the hint, did they regress? Build a small eval set of canned student transcripts to regression-test prompt changes. **Without this, you cannot ship a v2 tutor with confidence.**
- **Cost:** Instrumentation = 2 days; eval harness = 1 week.

### GDPR-style data export
- **Phase:** MVP
- **Why:** Trivial to build day 1, expensive to retrofit. Single endpoint → `profile.json` + `episodes.jsonl`. Builds trust (users see their data is theirs); future-proofs for SaaS legal requirements.
- **Cost:** ~1 day.

### Accessibility baseline
- **Phase:** MVP (baseline), v1 audit
- **Why:** Keyboard navigation, screen-reader labels on Monaco, captions for any audio. Hard to retrofit; cheap to do up front. Also expands the audience.
- **Cost:** Baseline is ongoing discipline; an audit costs 2–3 days.

### Pomodoro / break reminders
- **Phase:** v1
- **Why:** Beloved, simple, complements gamification. Eye-strain reminder, posture nudge, "you've coded 90 min, take a 10-min walk" — protects users *from* over-engaged learning.
- **Cost:** ~1 day.

---

## Medium-leverage adds (v2)

### Project-based learning
- Multi-session projects with milestones (e.g., "build a CLI todo app over 4 sessions"). What converts skill into portfolio. Pairs with GitHub integration.

### Mock interviews with a separate "interviewer" agent persona
- Timed problems, neutral demeanor, no hints, post-interview debrief. **Major willingness-to-pay signal** for the SaaS phase.

### Frustration / confusion detection
- From voice prosody + behavioral signals (long pauses, repeated edits in same area, hint cascades). Triggers proactive difficulty drop or different explanation style. Pairs with voice (v1+).

### Pair-programming / code-review mode
- Agent acts as a peer engineer reviewing your code, asking questions, pointing out alternatives — different from "tutor" tone.

### Learning-style and chronotype assessment
- Light-touch (don't over-claim science). Inform plan timing (morning vs. evening sessions) and content delivery (more visuals vs. more text vs. more code).

---

## Explicitly de-prioritized (chose not to recommend)

| Feature | Why not |
|---|---|
| Certifications | Low credibility without industry accreditation; legal/regulatory complexity |
| Public social feed / forums | Moderation cost dwarfs the engagement benefit at our stage |
| Mentor matching marketplace | Two-sided market problem; not the right business shape pre-SaaS |
| 3D / VR / avatar features | Massive scope, low ROI vs. the core loop |
| AI-generated voice cloning of "famous teachers" | Legal + ethical minefield |
| Crypto / NFT badges | No |

---

## How these are tracked

When (if) any of these are accepted, they become Stories in `project/stories/` under the relevant Epic. Most map naturally:

- Spaced repetition → EPIC-005 (Learner Profile) or EPIC-007 (Adaptive Problems)
- Hint laddering → EPIC-007 (Adaptive Problems) or EPIC-004 (Tutor Agent)
- Knowledge graph → EPIC-005 (Learner Profile)
- Anti-cheat → EPIC-016 (Security & Anti-cheat)
- Debugging / "read this code" exercises → EPIC-007 (Adaptive Problems)
- GitHub portfolio → new Epic or EPIC-013 (Cross-platform → integrations)
- Telemetry / eval harness → EPIC-004 (Tutor Agent) + new "Observability" Epic if scope grows
- Data export → EPIC-015 (SaaS Readiness)
- Accessibility → cross-cutting, tracked as a Story under whichever Epic owns the affected surface
