---
id: EPIC-005
title: Learner profile and skill graph
type: epic
status: backlog
priority: P0
phase: mvp
tags: [profile, schema, skill-graph, db]
created: 2026-04-25
updated: 2026-04-25
---

## Goal

Build the data model that *is* LearnPro's adaptive intelligence: a learner profile that tracks per-concept mastery, pace, errors, and "sharpness" signals; an episodic memory of every attempt; and a skill graph mapping concepts to prerequisites and tracks.

Without this, "adaptive" is hand-waving. With this, every other Epic has the substrate it needs to make smart decisions.

## Scope

**MVP:**
- Postgres schema (Drizzle) for: `users`, `profiles`, `tracks`, `concepts`, `prerequisites` (concept ↔ concept), `problems`, `problem_concepts`, `episodes` (per-attempt), `hints`, `scores` (per-concept, per-user).
- pgvector column on `episodes` for embeddings (used later by RAG).
- Profile fields: weekly time budget, target role, current self-assessed level, languages-known, languages-learning.
- Per-concept skill score updated after each episode.
- Heuristic "sharpness" signal derived from (time-to-solve / hint-count / error-count) over recent episodes.

**v1+:**
- Knowledge graph populated with ~200 concepts and prerequisite edges.
- Spaced repetition (FSRS) review schedule per concept.
- Decay model for concepts not practiced recently.
- Profile-update agent (async) that synthesizes higher-level traits from episodes.

## Out of scope

- Multi-tenant profile partitioning (deferred — EPIC-015 SaaS Readiness).
- Profile-export UI (covered by data export, EPIC-015).

## Stories under this Epic

- STORY-014 — Design profile schema (users, profiles, episodes, scores) (MVP)
- STORY-015 — Implement skill graph schema (concepts + prerequisites) (MVP)

## Exit criteria (MVP)

- [ ] Schema migrations run cleanly from a fresh Postgres.
- [ ] Skill graph schema exists even if only 20–30 concepts are populated for MVP.
- [ ] Per-concept skill scores update after each episode and influence the difficulty tuner's next-problem choice.
- [ ] Profile JSON export contains every column without manual flattening.

## Related

- ADR: [`ADR-0004-database`](../../docs/architecture/ADR-0004-database.md)
- Vision: [`docs/vision/GROOMED_FEATURES.md`](../../docs/vision/GROOMED_FEATURES.md) § Theme 2
- Recommended additions: [`docs/vision/RECOMMENDED_ADDITIONS.md`](../../docs/vision/RECOMMENDED_ADDITIONS.md) — Knowledge graph

## Activity log

- 2026-04-25 — created
