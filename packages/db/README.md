# `@learnpro/db`

Drizzle ORM schema + Postgres connection pool. Owns every table in the system.

## What's here

- [`src/schema.ts`](./src/schema.ts) — every table (users, profiles, concepts, skill_scores, tracks, problems, episodes, submissions, agent_calls, notifications, organizations) and every enum. Every table has `org_id NOT NULL DEFAULT 'self'` (EPIC-015 SaaS-readiness primitive).
- [`src/relations.ts`](./src/relations.ts) — Drizzle relations API for nested queries (`db.query.users.findFirst({ with: { profile: true, episodes: true } })`).
- [`src/client.ts`](./src/client.ts) — `createDb({ connectionString })` factory + `loadDatabaseUrl(env)` helper. Returns the `LearnProDb` typed handle and the underlying `pg.Pool` so callers can manage shutdown.
- [`src/migrate.ts`](./src/migrate.ts) — programmatic migration runner. Ensures the `pgvector` extension exists, then applies every SQL file in `migrations/` in lexicographic order.
- [`src/seed.ts`](./src/seed.ts) — idempotent demo seed (one organization, one user, one profile, one concept, one skill score, one track, one problem, one episode). Used by smoke tests; safe to re-run.

## Scripts

```bash
pnpm --filter @learnpro/db db:generate   # diff schema vs. journal, write a new migration
pnpm --filter @learnpro/db db:migrate    # apply pending migrations (also enables pgvector)
pnpm --filter @learnpro/db db:seed       # insert idempotent demo data
```

All three read `DATABASE_URL` from the environment. The dev default in `infra/docker/docker-compose.dev.yaml` is `postgresql://learnpro:learnpro@localhost:5432/learnpro` running on `pgvector/pgvector:pg16`.

## Embedding column (pgvector)

`episodes.embedding` is a `vector(1536)` column (OpenAI `text-embedding-3-small` / Voyage `voyage-3` default size). It is **nullable** — a downstream reflection job fills it after the episode finishes, not at insert time. The `runMigrations()` helper enables `CREATE EXTENSION IF NOT EXISTS vector` before any migration runs, so a fresh Postgres instance is bootstrapped automatically.

## What lives elsewhere

- Auth integration with this schema: STORY-005 (next).
- pgvector index + nearest-neighbour query helpers: STORY-014.
- Full knowledge-graph seed: STORY-015.
- Submission/agent_call interaction logging: STORY-055.
