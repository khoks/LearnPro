---
id: EPIC-017
title: Product discovery, competitive positioning, and feature grooming
type: epic
status: done
priority: P0
phase: scaffolding
tags: [product, discovery, competitive, grooming]
created: 2026-04-25
updated: 2026-04-25
---

## Goal

Before the MVP build starts, deepen the product thinking so we know exactly what makes LearnPro **different** from the dozen platforms a serious learner already considers, what the **detailed UX** of each MVP epic should feel like, and what **other ideas** belong in the backlog (without bloating MVP scope).

This Epic is **product/strategy work**, not implementation. It produces durable docs and backlog entries that the MVP build will reference.

## Scope

Three phases, one Story each:

- **Phase B — Competitive & differentiator spec** (STORY-028)
  - `docs/product/COMPETITIVE.md` — teardown of the platforms a serious learner has already tried (LeetCode, Codewars, Boot.dev, Exercism, freeCodeCamp, Codecademy, DataCamp, CS50, Brilliant, JetBrains Academy, Codecrafters, Cursor/Copilot, ChatGPT-as-tutor, etc.).
  - `docs/product/DIFFERENTIATORS.md` — the wedge in one sentence, 7–8 specific differentiators with concrete examples, what we explicitly *don't* compete on, why now, and how a competitor could catch up.

- **Phase A — Per-feature deep-dive on MVP epics** (STORY-029)
  - `docs/product/UX_DETAILS.md` — section per MVP epic with detailed UX mechanics, tutor pedagogy patterns, design alternatives at every fork, edge cases, and concrete user-facing examples.
  - Targeted updates to MVP epic files: each gets a "Design notes & alternatives" section pointing to the relevant UX_DETAILS section + listing the locked decisions.

- **Phase C — Backlog expansion** (STORY-030)
  - 40–60 new feature ideas across all 16 epics, each with rationale, target phase, related epic, and tradeoffs/alternatives.
  - The most important 15–20 filed as new STORY files.
  - `RECOMMENDED_ADDITIONS.md` updated with the broader catalog.

## Out of scope

- Any code implementation (still EPIC-002 onward).
- User research / interviews (would be useful but the user is a single dev with strong product instincts; defer to v1+ when the product exists).
- Pricing / business model design (defer until SaaS planning in v3 — EPIC-015).

## Stories under this Epic

- [STORY-028](../stories/STORY-028-competitive-and-differentiators.md) — Competitive teardown + differentiators (done)
- [STORY-029](../stories/STORY-029-ux-deep-dive.md) — Per-feature UX deep-dive (done)
- [STORY-030](../stories/STORY-030-backlog-expansion.md) — Backlog expansion (done)

## Exit criteria

- [x] All three Phase docs exist and are substantive (not skeletons).
- [x] Every MVP epic file has a "Design notes & alternatives" section after Phase A.
- [x] At least 15 new STORY files filed in `project/stories/` after Phase C (filed 20: STORY-031..STORY-050).
- [x] `RECOMMENDED_ADDITIONS.md` updated with the expanded backlog (116-idea catalog).

## Related

- The user's grooming request (2026-04-25, this session).
- Vision: [`docs/vision/RAW_VISION.md`](../../docs/vision/RAW_VISION.md), [`docs/vision/GROOMED_FEATURES.md`](../../docs/vision/GROOMED_FEATURES.md), [`docs/vision/RECOMMENDED_ADDITIONS.md`](../../docs/vision/RECOMMENDED_ADDITIONS.md).

## Activity log

- 2026-04-25 — created; Phase B kicked off
- 2026-04-25 — Phase B done (`docs/product/COMPETITIVE.md`, `docs/product/DIFFERENTIATORS.md`)
- 2026-04-25 — Phase A done (`docs/product/UX_DETAILS.md` + design-notes section on every MVP epic)
- 2026-04-25 — Phase C done (RECOMMENDED_ADDITIONS expanded; 20 new stories STORY-031..050 filed)
- 2026-04-25 — Epic closed; product grooming complete. MVP build (EPIC-002) is the next session.
