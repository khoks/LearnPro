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

## Activity log

- 2026-04-25 — created
