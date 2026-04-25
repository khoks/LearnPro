# `scripts/mac/`

macOS-specific scripts (bash). **Stub for now** — a Mac contributor can flesh these out without touching `scripts/windows/`.

**Planned scripts (mirror `scripts/windows/`):**

- `bootstrap.sh` — verify Docker Desktop, install Node 20 via `nvm`, install `pnpm`, copy `.env.example` to `.env`, run migrations.
- `start-dev.sh` — bring up the dev stack and run `pnpm dev`.
- `stop-dev.sh` — shutdown.

**Conventions:**

- LF line endings (enforced by `.gitattributes`).
- `set -euo pipefail` at the top of every script.
- Must work on both Intel and Apple Silicon (use Docker images with multi-arch manifests).
