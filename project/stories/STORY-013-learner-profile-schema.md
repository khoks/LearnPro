---
id: STORY-013
title: Learner profile schema (per-concept skill, episodic log, org_id everywhere)
type: story
status: done
priority: P0
estimate: M
parent: EPIC-005
phase: mvp
tags: [schema, drizzle, profile, postgres]
created: 2026-04-25
updated: 2026-04-26
---

## Description

The data model that everything else hangs off of. Drizzle ORM (per [ADR-0004](../../docs/architecture/ADR-0004-database.md)) defines:

- `users` — id, email, github_id, created_at, **org_id** (defaulted to `'self'` on self-hosted).
- `profiles` — user_id (FK), target_role, time_budget_min, primary_goal, self_assessed_level, language_comfort (JSONB), updated_at.
- `concepts` — id, slug, name, language, parent_concept_id (the start of the knowledge graph; populated more fully in v1).
- `skill_scores` — user_id, concept_id, score (0–1 float), confidence (0–1 float), last_practiced_at.
- `episodes` — id, user_id, problem_id, started_at, finished_at, hints_used (int), attempts (int), final_outcome (enum), time_to_solve_ms, **embedding (vector(1536), nullable)**.
- `tracks`, `problems`, `submissions`, `agent_calls`, `notifications` — secondary tables defined here for completeness.

Every table has `org_id NOT NULL DEFAULT 'self'` and a `created_at`. This is the EPIC-015 SaaS-readiness primitive landing on day 1.

## Acceptance criteria

- [ ] `packages/db/src/schema.ts` defines all tables with proper foreign keys and indexes.
- [ ] Initial migration generated and applied via `drizzle-kit migrate`.
- [ ] Every table has `org_id` column with default `'self'`.
- [ ] pgvector extension enabled and `episodes.embedding` column is `vector(1536)` (OpenAI/Anthropic embedding size).
- [ ] Drizzle relations defined so `db.query.users.findFirst({ with: { profile: true, episodes: true } })` works.
- [ ] Seed script populates one demo user + one demo episode (used by smoke tests).

## Dependencies

- Blocks: STORY-005, STORY-011, STORY-014.
- Blocked by: (none — pure schema work).

## Tasks

(To be created when work begins.)

## Activity log

- 2026-04-25 — created
- 2026-04-26 — picked up; designing Drizzle schema (organizations, users, profiles, concepts, skill_scores, episodes with pgvector embedding column, tracks, problems, submissions, agent_calls, notifications) + initial migration + seed + `org_id NOT NULL DEFAULT 'self'` on every table.
- 2026-04-26 — done. Landed in PR #11 (commit `69f5938`). 11 tables, 4 enums, 11 FKs, 12 indexes generated as `migrations/0000_furry_sway.sql`. `runMigrations()` enables `pgvector` before applying SQL. Idempotent seed inserts demo org/user/profile/concept/skill_score/track/problem/episode. 19 schema-introspection unit tests assert SaaS-readiness invariants + pgvector dimension + enum membership + FK/PK shapes. Unblocks STORY-005 (auth), STORY-011 (tutor agent), STORY-014 (pgvector index).
