# ADR-0001 — Use a pnpm + Turborepo monorepo

- **Status:** Accepted (2026-04-25)
- **Deciders:** Rahul (project owner)
- **Phase:** Scaffolding (pre-MVP)

## Context

LearnPro will, by v1, have a Next.js app, a Fastify backend, multiple shared packages (LLM gateway, sandbox abstractions, database schema, agent harness, profile/skill-graph logic), and infrastructure code. Splitting these into separate repos early would add coordination overhead for a solo developer; keeping them in a single package would make boundaries impossible to enforce.

We need a structure that:

- Enforces clean package boundaries (so abstractions stay intentional).
- Makes shared types automatic (Zod schemas → TS types in one package, consumed everywhere).
- Stays light enough for a solo dev (no per-package CI complexity).
- Can scale to a team and add CI caching when needed.
- Plays well with Windows-first development.

Options considered:

| Option | Pros | Cons |
|---|---|---|
| Single Next.js app, no packages | Simplest start | No enforced boundaries; refactor cost compounds |
| pnpm workspaces only | Light, native | No remote caching, no task orchestration |
| **pnpm + Turborepo** | Fast, simple, ubiquitous, Windows-friendly | One more tool to know |
| Nx | Powerful (graphs, generators) | Heavyweight for a solo dev; opinionated |
| Yarn workspaces | Mature | Slower than pnpm; pnpm is the modern default |
| npm workspaces | Built-in | Slower install; weaker hoist control than pnpm |

## Decision

Use **pnpm workspaces + Turborepo**.

Layout:

```
LearnPro/
  apps/web/                # Next.js — MVP here
  packages/
    shared/                # types, Zod schemas
    agent/                 # tutor harness, prompts, evals
    sandbox/               # SandboxProvider + Piston/Docker impls
    db/                    # Drizzle schema + migrations
    llm/                   # LLMProvider + adapters
    notifications/         # NotificationChannel + impls
    profile/               # learner profile + skill graph
  infra/
  scripts/
```

Package manager pinned via `packageManager` field in root `package.json`. Node version pinned via `.nvmrc` (Node 20 LTS).

## Consequences

**Positive:**
- Boundaries are enforced by package imports — refactors stay localized.
- Shared types are automatic (publish from `packages/shared`, import everywhere).
- Turborepo's task graph + caching speeds up `lint`, `test`, `build` when a team forms.
- Migration to Nx later is possible if needed (Turborepo and Nx target similar problems).

**Negative:**
- One more tool than strict-minimum. Onboarding cost for new contributors is small but non-zero.
- pnpm's symlinked `node_modules` occasionally surprises tooling that assumes a flat layout. Mitigated by sticking to mainstream tooling (Next.js, Vitest, Playwright, Drizzle — all known-good with pnpm).

**Neutral:**
- The actual `package.json`, `pnpm-workspace.yaml`, `turbo.json` files are not created yet — they land when the MVP build session begins. This ADR locks the *decision*; execution happens later.
