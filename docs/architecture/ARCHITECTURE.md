# ARCHITECTURE.md — LearnPro tech architecture

> **Status:** Proposed; foundational decisions ratified in ADRs 0001–0005. Updated whenever an ADR lands.
> **Audience:** anyone building or reviewing LearnPro code.

---

## 1. North star

A self-hosted-first, SaaS-later adaptive coding tutor. Every external dependency sits behind an adapter interface so the SaaS migration is a config flip, not a rewrite. Windows is the primary dev OS; Mac/Linux work via OS-specific adapter packages.

---

## 2. High-level component map

```
                         ┌──────────────────────────────┐
                         │   Browser (Next.js client)   │
                         │  Monaco · TanStack · Zustand │
                         └──────────────┬───────────────┘
                                        │  WebSocket / tRPC / HTTP
                                        ▼
            ┌─────────────────────────────────────────────────┐
            │         Next.js server + Fastify API            │
            │  Auth · tRPC routers · WebSocket /realtime      │
            └────────┬─────────────┬────────────────┬─────────┘
                     │             │                │
                     ▼             ▼                ▼
            ┌────────────┐  ┌─────────────┐  ┌──────────────┐
            │ LLM Gateway │  │  Sandbox    │  │ BullMQ jobs  │
            │ (Anthropic) │  │ (Piston/    │  │ (grading,    │
            │             │  │  Docker)    │  │  notifs,     │
            └─────────────┘  └─────────────┘  │  profile     │
                                              │  updates)    │
                                              └──────┬───────┘
                                                     │
                ┌──────────┬───────────┬─────────────┴──────┐
                ▼          ▼           ▼                    ▼
          ┌─────────┐ ┌─────────┐ ┌─────────┐        ┌─────────┐
          │Postgres │ │pgvector │ │  Redis  │        │  MinIO  │
          │(records)│ │(embeds) │ │(cache,  │        │(objects)│
          │         │ │         │ │ queues) │        │         │
          └─────────┘ └─────────┘ └─────────┘        └─────────┘
```

---

## 3. Frontend

- **Next.js 15 (App Router) + React 19 + TypeScript.** SSR for marketing/SEO later, RSC for fast lessons, mature PWA story, easy Capacitor wrapping.
- **Tailwind CSS + shadcn/ui.** No vendor lock-in (shadcn = your-own-components).
- **Monaco editor.** Better LSP story than CodeMirror; matches users' VS Code muscle memory.
- **Zustand** for client state, **TanStack Query** for server state, **Zod** for runtime validation everywhere.
- **Vitest** for units, **Playwright** for E2E.

---

## 4. Backend

- **Node.js (Fastify) + TypeScript.** Single language across stack; shared types via `packages/shared`. Add a Python *worker* service later only if ML-specific code requires it.
- **tRPC** for the web client (end-to-end types). Same router exposed as **REST** via an adapter when third-party / mobile-native clients arrive.
- **BullMQ on Redis** for background jobs: grading, profile updates, notification dispatch, RAG indexing.
- **Drizzle ORM** over Prisma — better TS inference, lighter, plays well with raw-SQL pgvector queries.

---

## 5. Code-execution sandbox

See [ADR-0002](./ADR-0002-sandbox.md) for the trade-off analysis.

- **MVP:** self-hosted **Piston** in Docker on WSL2 for one-shot run-and-grade across many languages.
- **v1+:** add a Docker-Compose-managed pool of long-lived language containers for stateful, multi-file, framework work.
- **v3 / SaaS:** swap to **gVisor** runtime under Docker on Linux hosts. Add **Firecracker microVMs** at scale.

All execution wrapped behind a `SandboxProvider` interface (`packages/sandbox`) so the swap is contained.

**Hardening (mandatory from day 1, regardless of provider):**
- No network (`--network none` or equivalent)
- Read-only root filesystem; tmpfs at `/tmp`
- CPU / memory / pids cgroups
- Wall-clock timeout, output truncation
- Drop all capabilities (`--cap-drop=ALL`)
- Non-root UID inside container
- seccomp profile (custom or `runtime/default`)
- **Never `--privileged`. Ever.**
- Treat the runner host as compromised by design — isolate it from the API host on a separate network/VM/host.

---

## 6. Databases

See [ADR-0004](./ADR-0004-database.md).

- **Postgres 16** — system of record (users, profiles, problems, episodes, plans).
- **pgvector** extension — embeddings, semantic search. **No separate vector DB** (Pinecone, Qdrant, Weaviate) until pgvector demonstrably hurts.
- **Redis 7** — sessions, BullMQ queues, rate limits, ephemeral pub/sub.
- **MinIO** (self-hosted) for object storage (workspace snapshots, uploaded assets) — wrapped behind an `ObjectStore` interface so S3 / R2 plug in for SaaS.

---

## 7. LLM gateway

See [ADR-0003](./ADR-0003-llm-provider.md).

- **`LLMProvider` interface** in `packages/llm` with `complete`, `stream`, `embed`, `tool_call` methods.
- **Anthropic adapter** is the primary implementation (Opus for tutor, Haiku for grading/routing/embedding-style tasks where applicable).
- **OpenAI** and **Ollama** adapters stubbed with TODO bodies — the interface forces the abstraction to exist before a second provider is needed.
- **Prompt registry** — versioned, in-repo at `packages/agent/prompts/`, hot-reloaded in dev.
- **Eval harness** — Promptfoo or hand-rolled, runs on every PR that touches a prompt.
- **Per-user daily token budget** with graceful degradation messages. Cost telemetry on every call.

---

## 8. Real-time layer

- **WebSockets via Fastify + ws.** Single `/realtime` gateway multiplexes channels (sandbox stdout, agent token streaming, future voice transcription).
- **SSE fallback** for environments with strict proxies.

---

## 9. Notifications

- `NotificationChannel` interface in `packages/notifications`.
- **MVP:** Web Push (VAPID), in-app notification center.
- **v1:** email digests via Resend or Postmark.
- **v2:** WhatsApp via **Meta Cloud API** directly (lowest cost, official). Twilio used only for SMS later.

---

## 10. Auth & multi-tenancy (SaaS insurance)

- **Auth.js (NextAuth)** with email magic link + GitHub OAuth.
- **`org_id` on every row from day 1** (defaulted on self-hosted to a single org).
- Feature flags via **GrowthBook self-hosted** so paid features can be toggled later.
- JWT for API; httpOnly session cookie for web.
- SaaS = config flip (enable orgs, enable billing, enable feature flags).

---

## 11. Cross-platform path

- **PWA-first** — manifest, service worker, install prompt, offline shell from v1.
- **Capacitor** wraps the same Next build for iOS/Android in v2. Native plugins only for **mic** and **push**. No React Native rewrite — the editor-centric workload doesn't need it.
- OS adapters in `scripts/{windows,mac,linux}/` for bootstrap and runtime quirks. Windows is the implemented one; mac/ and linux/ have stubs.

---

## 12. The adapter pattern (single biggest SaaS-readiness lever)

All defined in `packages/`, each with one impl shipped now and others stubbed:

| Interface | MVP impl | Future impls |
|---|---|---|
| `SandboxProvider` | Docker + WSL2 + Piston | gVisor (Linux), Firecracker (SaaS scale) |
| `NotificationChannel` | Web Push | Email, WhatsApp, SMS |
| `LLMProvider` | Anthropic | OpenAI, Ollama |
| `ObjectStore` | Local FS / MinIO | S3, R2 |
| `Auth` | Single-user + magic link | Multi-tenant SSO, SAML |
| `Telemetry` | Console | OpenTelemetry, managed APM |

Single biggest predictor of whether the SaaS migration is a weekend or a quarter. **Don't skip the adapters even when only one impl exists.**

---

## 13. Repo layout (monorepo)

See [ADR-0001](./ADR-0001-monorepo.md). pnpm workspaces + Turborepo.

```
LearnPro/
  apps/
    web/                 # Next.js — MVP lives here
  packages/
    shared/              # types, zod schemas
    agent/               # tutor harness, prompts, evals
    sandbox/             # SandboxProvider + Piston/Docker impls
    db/                  # Drizzle schema + migrations
    llm/                 # LLMProvider + adapters
    notifications/       # NotificationChannel + impls
    profile/             # learner profile + skill graph
  infra/
    docker/              # runner Dockerfiles per language
    scripts/             # bootstrap.ps1, bootstrap.sh
  scripts/
    windows/             # implemented bootstrap
    mac/                 # stub
    linux/               # stub
```

---

## 14. Top risks (mirrored in `/project/` as Stories with `priority: P0`)

1. **Scope creep** — 11 themes is 18 months of team work. Mitigation: MVP gate; new ideas → `project/` as backlog Stories, not MVP code.
2. **Sandbox security incident** — user breaks out or DOSes the host. Mitigation: defense-in-depth from day 1 (see §5); never `--privileged`; treat runner host as compromised.
3. **LLM cost runaway** — agentic loops + long context. Mitigation: per-user daily token budget, smaller models for routing/grading, embedding cache, anomaly alerts.
4. **Tutor hallucination** — confidently teaches wrong things. Mitigation: eval harness from v1, ground responses in curated content (RAG), separate grader agent, "report this answer" feedback loop.
5. **"Adaptive" that isn't actually adaptive** — without a skill graph and honest signal (anti-cheat), it's vibes. Mitigation: model the skill graph in MVP even if shallow; instrument every signal; validate with a small cohort before claiming adaptiveness in marketing.

---

## 15. References

- [ADR-0001 — Monorepo (pnpm workspaces + Turborepo)](./ADR-0001-monorepo.md)
- [ADR-0002 — Sandbox runtime (Piston on WSL2 → gVisor → Firecracker)](./ADR-0002-sandbox.md)
- [ADR-0003 — LLM provider primary (Anthropic) via `LLMProvider` interface](./ADR-0003-llm-provider.md)
- [ADR-0004 — Database stack (Postgres + pgvector + Redis)](./ADR-0004-database.md)
- [ADR-0005 — License (BSL 1.1)](./ADR-0005-license.md)
- [Groomed feature catalog](../vision/GROOMED_FEATURES.md)
- [Recommended additions](../vision/RECOMMENDED_ADDITIONS.md)
- [MVP scope](../roadmap/MVP.md)
- [Roadmap](../roadmap/ROADMAP.md)
