---
id: STORY-029
title: Per-feature UX deep-dive on MVP epics
type: story
status: done
priority: P0
estimate: L
parent: EPIC-017
phase: scaffolding
tags: [product, ux, design, grooming]
created: 2026-04-25
updated: 2026-04-25
---

## Description

Phase A of the product-grooming pass. For each MVP epic (EPIC-002 through EPIC-013, EPIC-015, EPIC-016), produce detailed UX specs in `docs/product/UX_DETAILS.md` covering:

- **Concrete user flows** — what the user sees and does, step by step.
- **Tutor pedagogy patterns** (esp. EPIC-004) — when does the tutor question vs. reveal? What's its tone? How does it handle a frustrated user? A clearly-cheating user? An over-confident user?
- **Design alternatives** — at every meaningful fork, 2–3 options with pros/cons and a locked recommendation.
- **Edge cases & error states** — sandbox crashes, LLM rate-limited, network drops mid-stream, user pastes 10MB file, user submits malformed code, user closes tab mid-grade.
- **The first-session magic moment** — what's the "aha" that makes a user come back tomorrow?

Each touched epic file gets a brief "Design notes & alternatives" section pointing into UX_DETAILS for the meat.

## Acceptance criteria

- [x] `docs/product/UX_DETAILS.md` has a substantive section per MVP epic.
- [x] Tutor pedagogy section in EPIC-004 deep-dive locks the tone, the question-vs-reveal heuristic, and the cheating/frustration responses.
- [x] Every fork has 2–3 documented alternatives + a locked recommendation.
- [x] First-session UX is specified end-to-end with timing budgets per step.
- [x] Each MVP epic file has a "Design notes & alternatives" section.

## Dependencies

- Blocked by: STORY-028 (differentiators inform which UX choices reinforce the wedge).

## Activity log

- 2026-04-25 — created
- 2026-04-25 — picked up; in-progress
- 2026-04-25 — done (UX_DETAILS.md written; design-notes section added to all 13 MVP epic files)
