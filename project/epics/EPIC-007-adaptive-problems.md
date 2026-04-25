---
id: EPIC-007
title: Adaptive problem system (banks, generation, hints, grading)
type: epic
status: backlog
priority: P0
phase: mvp
tags: [problems, content, hints, grading]
created: 2026-04-25
updated: 2026-04-25
---

## Goal

Provide problems calibrated to the learner's current skill, with progressive hints (laddered), reliable grading (hidden tests + LLM rubric), and difficulty tuning. The system must produce a felt sense of "this app knows what I need next."

## Scope

**MVP:**
- Curated seed problem bank (~30 per language for Python and TypeScript), each with: title, description, starter code, hidden test cases, reference solution, tagged concepts.
- Hidden-test grading via the sandbox.
- 3-rung hint ladder (nudge → conceptual → near-solution); each rung consumes XP per [recommended additions](../../docs/vision/RECOMMENDED_ADDITIONS.md).
- Concept tagging on every problem (links to EPIC-005 skill graph).

**v1+:**
- LLM-generated problem variants from seed problems.
- Difficulty parameters (input size, edge cases, constraints) the tuner can knob.
- Open-ended problems graded by LLM rubric.
- Problem deduplication / similarity check.
- Debugging exercises (broken code → fix it).
- "Read this code" comprehension exercises.

**v2+:**
- Difficulty calibration dashboard (operator view).

## Out of scope

- Mock interview problem set (separate Epic in v2).
- Algorithm visualizations.

## Stories under this Epic

- STORY-017 — Curated Python fundamentals problem bank (~30) (MVP)
- STORY-018 — Curated TypeScript fundamentals problem bank (~30) (MVP)
- STORY-019 — 3-rung hint ladder with XP cost (MVP)

## Exit criteria (MVP)

- [ ] Both problem banks pass hidden tests against their reference solutions.
- [ ] All three hint rungs render and behave distinctly.
- [ ] Hint usage is recorded on the episode and feeds the difficulty tuner.
- [ ] No two problems in a bank are near-duplicates.

## Related

- Vision: [`docs/vision/GROOMED_FEATURES.md`](../../docs/vision/GROOMED_FEATURES.md) § Theme 4
- Recommended additions: hint laddering, debugging exercises, "read this code"

## Design notes & alternatives

See [`docs/product/UX_DETAILS.md § EPIC-007`](../../docs/product/UX_DETAILS.md#epic-007--adaptive-problem-generation--grading) for the full deep-dive.

Key locked decisions for this Epic:
- **The grader is NOT the LLM.** Tests are the floor (deterministic pass/fail); LLM is the ceiling (commentary on idiomatic-ness, efficiency, one specific note). LLM-only grading hallucinates.
- **Grade revealed instantly when tests finish (~1.5s).** Tutor commentary streams in *after* the green/red verdict — latency-tolerant.
- **Hidden test failures show test *name* only** (e.g. "test_empty_input failed"). Never reveal the input — that defeats the purpose.
- **3-rung hint ladder with XP cost (5 / 15 / 30 XP).** Cost trains "think before clicking." 3 rungs is enough to walk from question → reveal; more rungs = decision paralysis.
- **Curated problem bank for MVP** (~30 per language, hand-written, in `packages/problems/`). LLM-generated *variants* land in v1; bank stays curated.
- **Difficulty tuner is a heuristic in MVP**: `delta_skill = +base × correctness_multiplier - 0.1 × hint_rungs - 0.05 × overtime - 0.05 × failed_attempts`. Replaced with a learned model in v1.
- **Next-problem selection rules**: same concept if `skill < 0.5`; advance if `skill ≥ 0.7 AND confidence ≥ 0.5`; one review problem from a fading concept every 3rd problem.

Alternatives considered (LLM-only grading, no hint cost, 5-rung ladder, rubric-based open-ended grading): see UX_DETAILS for rationale.

## Activity log

- 2026-04-25 — created
