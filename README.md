# LearnPro

> An adaptive, AI-tutored, self-hosted platform for learning to code (and later, ML / deep learning / building LLMs from scratch).

LearnPro hosts a containerized in-browser sandbox where you write and run code in many languages, while an LLM-backed agentic harness builds an evolving profile of your skills, pace, strengths, and gaps — and uses it to plan your next session, day, week, and long-term mastery roadmap. Adaptive problem difficulty, hint laddering, gamified progress, and (eventually) voice-driven "think-aloud" tutoring make it feel like a real teacher who actually knows you.

Self-hosted-first, open-source under [BSL 1.1](./LICENSE) (auto-converts to Apache 2.0 in 2030). SaaS later.

## Status

**Pre-MVP — scaffolding only.** No application code yet. The repo currently contains the vision, architecture, roadmap, and an in-repo project tracking system. MVP build kicks off next.

## Where to look

- **Vision (verbatim user input):** [`docs/vision/RAW_VISION.md`](./docs/vision/RAW_VISION.md)
- **Groomed feature catalog:** [`docs/vision/GROOMED_FEATURES.md`](./docs/vision/GROOMED_FEATURES.md)
- **Architecture & ADRs:** [`docs/architecture/`](./docs/architecture/)
- **MVP scope:** [`docs/roadmap/MVP.md`](./docs/roadmap/MVP.md)
- **Roadmap (MVP → v1 → v2 → v3):** [`docs/roadmap/ROADMAP.md`](./docs/roadmap/ROADMAP.md)
- **Live status board (Epics / Stories / Tasks):** [`project/BOARD.md`](./project/BOARD.md)
- **For Claude Code sessions:** [`CLAUDE.md`](./CLAUDE.md)

## Tech stack (locked)

Next.js 15 + React 19 + TypeScript · Node.js (Fastify) · Postgres + pgvector + Redis · Self-hosted Piston sandbox in Docker on WSL2 · Anthropic Claude (behind a `LLMProvider` interface) · pnpm workspaces + Turborepo monorepo.

## Platforms

Windows-first development; Mac/Linux supported via OS adapters. Browser app today → PWA in v1 → iOS/Android (Capacitor) in v2.

## License

[Business Source License 1.1](./LICENSE). Free to self-host for personal, team, school, or internal company use. Hosting LearnPro as a paid service to third parties is not permitted until the Change Date (2030-04-25), at which point this code converts to Apache License 2.0.
