# ADR-0004 — Database stack: Postgres + pgvector + Redis (no separate vector DB)

- **Status:** Accepted (2026-04-25)
- **Deciders:** Rahul (project owner)
- **Phase:** MVP

## Context

LearnPro stores:

- **Relational data** — users, profiles, problems, episodes (per-attempt logs), plans, skills, tracks, organizations.
- **Vector embeddings** — episodic memory for the agent, RAG over lesson content, similarity search across user attempts.
- **Ephemeral / queue data** — sessions, BullMQ job queues, rate-limit counters, pub/sub for real-time channels.
- **Object storage** — workspace snapshots, uploaded assets (later).

The tutor agent's "memory" is the episodic log + embeddings. Search must be fast and reliable, but recall over a single user's history will rarely exceed thousands of items in MVP — we are not at the scale where a dedicated vector DB earns its keep.

Constraints:

- Self-hostable on a developer laptop via Docker Compose (WSL2 on Windows).
- Cleanly migratable to managed services for SaaS (e.g., Neon / RDS Postgres, Upstash / ElastiCache Redis, S3 / R2 object storage).
- Minimize the number of moving parts in MVP.

Options considered:

| Choice | Pros | Cons |
|---|---|---|
| Postgres + **pgvector** | Single DB, SQL joins between vectors and metadata, mature, free, self-hostable | Slower than dedicated vector DBs at very large scale |
| Postgres + Pinecone | Best-in-class vector search | SaaS-only, costs from day 1, separate failure domain |
| Postgres + Qdrant (self-hosted) | Self-hostable, good performance | Second DB to operate; pgvector adequate at MVP scale |
| Postgres + Weaviate | Schema-first, hybrid search | Heavyweight; overkill for MVP |
| SQLite + sqlite-vec | Smallest footprint | Concurrency limits; not realistic for SaaS migration |
| MongoDB + vector index | Flexible schema | We want SQL; relational is the right model here |

## Decision

For MVP and v1:

- **Postgres 16** (Docker container) — system of record. **Drizzle ORM** for migrations and queries.
- **pgvector** extension on the same Postgres instance — embeddings stored alongside the rows they describe.
- **Redis 7** (Docker container) — sessions, BullMQ queues, rate limits, ephemeral pub/sub.
- **MinIO** (Docker container) — S3-compatible object storage. Wrapped behind an `ObjectStore` interface so the SaaS migration to S3 / R2 is a config flip.

Embedding model selection is delegated to the LLM gateway ([ADR-0003](./ADR-0003-llm-provider.md)).

For v2 / SaaS scale: re-evaluate adding **Qdrant** *only if* pgvector's recall, latency, or operational cost demonstrably hurts. Until then, no second vector store.

## Consequences

**Positive:**
- One database for relational + vector data → simple joins, simple backups, simple migrations.
- Three Docker containers (Postgres, Redis, MinIO) cover all storage needs in MVP — easy to spin up via Docker Compose.
- All three have managed-service equivalents (RDS / Neon / Supabase, Upstash / ElastiCache, S3 / R2) — SaaS migration is a config change, not a re-architecture.
- Drizzle's TypeScript inference + raw-SQL escape hatch handles pgvector's quirks well.

**Negative:**
- pgvector is fast but not the fastest vector store. At >10M embeddings per index, performance degrades. We accept this; MVP and v1 are nowhere near that scale.
- pgvector's HNSW indexing has memory implications; budget Postgres RAM accordingly when usage grows.
- MinIO adds one more container vs. raw filesystem; worth it for the S3-compatible interface from day 1.

**Neutral:**
- The actual schema is not in this ADR; it lands in `packages/db/schema/` when MVP build starts. The decision here is which engines, not which tables.
