# Novel ideas log

> Running log of mechanisms / workflows / scoring formulas / pedagogy patterns that the user (or Claude) flags as **possibly novel** — not just "we like this" but "no other platform we know of works this way." Maintained by the [`harvest-knowledge`](../../.claude/skills/harvest-knowledge/SKILL.md) skill. Newest entries on top.
>
> **Why this exists:** if LearnPro's wedge against the dozen existing platforms is real, parts of it may be genuinely new — and worth (a) protecting via patent search and (b) marketing as differentiators. We track candidates here so future-us can decide whether to do a real prior-art search before publishing or shipping.
>
> **Honesty gate:** false novelty flags are expensive (legal time, marketing rework). If a five-second mental check turns up obvious prior art (LeetCode, Boot.dev, Anki, ChatGPT-as-tutor, an academic paper), write it down in the entry. Better to kill a flag than to chase a phantom claim.

---

## 2026-04-25 — Rich interaction-level telemetry as live tutor input

**What it is:** Capture what the user is *doing while they think* — cursor focus / dwell time per code section, voice while focused on a section (opt-in, text-only via browser SpeechRecognition), edit-and-revert sequences within a configurable time window, and time-per-section. Feed this stream to the tutor in real-time so it can coach based on *how* the user is thinking, not just whether they passed the tests.
**Where it lives in the product:** [STORY-055](../../project/stories/STORY-055-rich-interaction-telemetry-schema.md) (schema + capture, MVP). v1 Stories will consume the stream in the tutor / scoring policies.
**Why it might be novel:** Replit / collaborative IDEs log keystrokes for sync; some research IDEs (codex.io) capture interaction telemetry for *post-hoc analysis*. Using the stream as **live signal during tutoring** is the angle I haven't seen.
**Patentability signal:** plausible — "method of tutoring a code learner using real-time interaction-stream signal beyond outcomes" is a specific, articulable mechanism. Worth a real prior-art search before publishing the v1 implementation. Not legal advice.
**Open questions:** can a tutor LLM actually use this signal usefully (vs. just adding noise)? what privacy posture is acceptable for voice (we default off + 30-day retention)?
**Owner:** user (Rahul) — flagged 2026-04-25 during Path A scope discussion (Q2G).
**Status:** candidate

---

## 2026-04-25 — Single-agent harness with workflow-routed model selection via skill/policy docs

**What it is:** One agentic loop. An orchestrator inspects the active workflow (onboarding, hint generation, grading, session planning, profile update, etc.), loads that workflow's skill/policy doc, and from that doc picks the model + tool set + prompt graph to run. So the "tutor" and "grader" aren't separate agents — they're the same agent harness running different workflow configurations.
**Where it lives in the product:** ADR-0006 (forthcoming, separate PR). Foundation interfaces in [STORY-057](../../project/stories/STORY-057-policy-adapter-interfaces.md).
**Why it might be novel:** The architectural pattern itself (workflow router → skill/policy doc → model/tool selection) is essentially what the **Claude Agent SDK** already does. So as architecture, low novelty. The plausibly-novel piece is the *pedagogy-specific* application — workflow policies for "Socratic question generation," "rung-laddered hint generation," "anti-praise grading," "interaction-aware profile update."
**Patentability signal:** weak. This is mostly the strategy-pattern + DI applied to LLM orchestration. The pedagogy-specific policies might be patentable in combination but not as architecture.
**Open questions:** are the pedagogy-specific policies independently novel enough to file separately? Probably not until they're implemented and tested.
**Owner:** user (Rahul) — confirmed 2026-04-25 during Path A scope discussion (Q2C).
**Status:** candidate (low confidence in novelty — keeping for honest record)

---

## 2026-04-25 — Multi-dimensional personalized difficulty perception

**What it is:** Difficulty perceived by *this* user for *this* topic is a function of their IQ-proxy, talent signal, "sharpness" (cognitive freshness), app-usage profile, learning profile, per-concept response history, current level, and other factors — not just outcome-rate. The `DifficultyPolicy` interface lets the v1 GenAI implementation incorporate all of this; the deterministic default ships with ELO + EWMA only.
**Where it lives in the product:** [STORY-057](../../project/stories/STORY-057-policy-adapter-interfaces.md) ships the interface (MVP). The full multi-dimensional GenAI implementation lands as a v1 Story.
**Why it might be novel:** BKT (Bayesian Knowledge Tracing) exists in academic settings but is per-skill, not multi-dimensional-per-user. ELO is purely outcome-based. IRT (Item Response Theory) calibrates *items*, not the perception model. The full multi-dimensional model is what I haven't seen explicitly built.
**Patentability signal:** plausible — "method of inferring per-user perceived difficulty incorporating IQ-proxy, sharpness, learning profile, and per-concept history into a unified scalar via GenAI" is articulable. Real prior-art search needed before any patent move.
**Open questions:** how is "IQ-proxy" estimated without an explicit IQ test (we don't want one)? probably from solve-time distributions on first encounters with new concepts. Needs design.
**Owner:** user (Rahul) — flagged 2026-04-25 during Path A scope discussion (Q2A).
**Status:** candidate

---

## 2026-04-25 — GenAI evolutionary scoring with operator-injectable rules

**What it is:** XP / scoring is not a static formula. The `ScoringPolicy` interface accepts user profile + episode history and returns `{ xp, mastery_delta }` via a deterministic default in MVP and via Claude in v1. The v1 implementation has an **operator-injectable rules slot** (configurable by the platform owner — me / the user) AND **evolves over time** based on what works for *each individual user* (not just population aggregates).
**Where it lives in the product:** [STORY-057](../../project/stories/STORY-057-policy-adapter-interfaces.md) interface (MVP). Full GenAI implementation as v1 Story.
**Why it might be novel:** Every learning platform I know uses deterministic XP / score formulas (Duolingo, Brilliant, Khan, LeetCode, Codecademy). I haven't seen "GenAI scores you, with operator-injectable rules, and the GenAI's heuristics evolve based on what reinforces *your* learning specifically." The combination of (a) GenAI-driven, (b) operator-tunable, (c) per-user-evolutionary is the wedge.
**Patentability signal:** plausible — "method for personalizing learner reward signals via GenAI with operator-tunable rule scaffolds and per-user evolutionary adaptation" is a specific, articulable claim. Worth a real prior-art search; possible adjacency in adaptive testing literature (CAT — Computerized Adaptive Testing) but those typically tune *item difficulty*, not *reward magnitude*.
**Open questions:** how do you validate that GenAI scoring is "working"? what's the cold-start behavior (deterministic default until N episodes accumulated)? how do you prevent the user feeling cheated by inconsistent scoring?
**Owner:** user (Rahul) — flagged 2026-04-25 during Path A scope discussion (Q1E).
**Status:** candidate

---

## 2026-04-25 — Adaptive agentic autonomy (ask-vs-act based on accumulated user-confidence signal)

**What it is:** The tutor builds a per-user confidence signal from agreement rate, engagement, and outcome success. The signal modulates how often the tutor *asks* the user before doing something vs. *just doing it*. Low confidence (cold start) → always confirm. Medium → confirm consequential, execute trivial. High → execute most things; only confirm the disruptive (e.g., switching tracks).
**Where it lives in the product:** [STORY-054](../../project/stories/STORY-054-adaptive-autonomy-controller.md) (runtime behavior, MVP — deterministic banded version). [STORY-057](../../project/stories/STORY-057-policy-adapter-interfaces.md) (interface). v1 GenAI version uses LLM to decide per-action.
**Why it might be novel:** Recommender systems "fade out" confirmation prompts implicitly after compliance. Some chat assistants pre-answer follow-up questions. But I haven't seen an agentic framework with an explicit per-user confidence signal driving an autonomy band as a first-class policy primitive.
**Patentability signal:** plausible — "method for determining agentic autonomy level from accumulated per-user trust signal" is articulable. Adjacency: bandit algorithms, trust-region methods. Real prior-art search needed.
**Open questions:** what's the right signal weighting? how do you handle a confidence collapse (user starts pushing back after a long compliance run)? hysteresis to prevent thrashing between bands?
**Owner:** user (Rahul) — flagged 2026-04-25 during Path A scope discussion (Q1C).
**Status:** candidate

---

## 2026-04-25 — Conversational adaptive onboarding with graceful exit

**What it is:** Replace the typical multi-screen "set up your account" form with a tutor-led conversation that asks consequential questions upfront, drills into specifics based on each answer, and lets the user say "later" / "skip" / "I'd rather just start" at any point — capturing whatever profile fields it has, persisting them, and routing to the dashboard.
**Where it lives in the product:** [STORY-053](../../project/stories/STORY-053-conversational-onboarding-agent.md) (replaces the form portion of STORY-005).
**Why it might be novel:** ChatGPT-as-tutor is well-trodden for *learning content*. Conversational form-replacement (e.g., Typeform conversational mode) exists but is scripted, not adaptive. Conversational onboarding *into a learning platform* with adaptive drill-down + graceful exit isn't standard. Duolingo, Brilliant, Khan, Codecademy all use static forms or no onboarding.
**Patentability signal:** weakish — conversational forms have prior art; the differentiating piece is the *learning-context-specific adaptive drill-down* and the *graceful-exit-with-partial-capture*. Possible "improvement on" claim, not a foundational one.
**Open questions:** at what cost does this run for every new signup (LLM tokens)? what's the fallback when the LLM provider is down (STORY-053 mandates a structured-form fallback)? does retention improve vs. a form? — measurable post-launch.
**Owner:** user (Rahul) — flagged 2026-04-25 during Path A scope discussion (Q1B).
**Status:** candidate

---

## Entry format

Newest entries go at the top of the list above. Use this template:

```markdown
## YYYY-MM-DD — <name of the idea>

**What it is:** 2–3 sentences describing the mechanism / workflow / formula
**Where it lives in the product:** epic / story link, or "not yet filed"
**Why it might be novel:** what existing approaches do *differently*; cite competitors / known prior art
**Patentability signal:** plain-language read on whether this looks like a method/process/system claim worth a real prior-art search; **never legal advice**
**Open questions:** what would need to be true for this to actually work; what could disprove novelty
**Owner:** who flagged it (usually the user)
**Status:** candidate | prior-art found (killed) | prior-art search in progress | filed (provisional/full) | abandoned
```

Update an entry's `Status` over time rather than creating a new entry. If `Status: prior-art found`, leave the entry in place (don't delete) — knowing what *isn't* novel is also valuable.
