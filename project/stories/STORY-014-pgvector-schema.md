---
id: STORY-014
title: pgvector column on episodes (schema only — retrieval comes in v1)
type: story
status: backlog
priority: P1
estimate: XS
parent: EPIC-005
phase: mvp
tags: [pgvector, embeddings, schema]
created: 2026-04-25
updated: 2026-04-25
---

## Description

Add the pgvector extension and a `vector(1536)` column to `episodes` so we can backfill embeddings later without a migration. **No retrieval logic in MVP** — that's [EPIC-014](../epics/EPIC-014-rag-memory.md) v1 work. This is purely "make sure the column exists from day 1 so we don't have to migrate a populated table later."

Folded into STORY-013 in practice; tracked as a separate story so the EPIC-014 work has a clear "starting point" reference.

## Acceptance criteria

- [ ] `CREATE EXTENSION IF NOT EXISTS vector;` runs in the initial migration.
- [ ] `episodes.embedding` is `vector(1536) NULL`.
- [ ] An IVFFlat index exists on `episodes.embedding` (parameters tunable later).

## Dependencies

- Blocked by: STORY-013 (folded into the same migration).

## Tasks

(To be created when work begins.)

## Activity log

- 2026-04-25 — created
