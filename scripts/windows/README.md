# `scripts/windows/`

Windows-specific scripts (PowerShell `.ps1` and `.cmd`). This is the **primary** OS bucket — LearnPro is Windows-first.

**Planned scripts:**

- `bootstrap.ps1` — verify Docker Desktop with WSL2 backend is installed and running, verify Node 20 via `nvm-windows` or pinned binary, install `pnpm`, set up local `.env` from `.env.example`, run `infra/scripts/migrate.ps1`.
- `start-dev.ps1` — `docker compose -f infra/docker/docker-compose.dev.yaml up -d` then `pnpm dev`.
- `stop-dev.ps1` — graceful shutdown of the dev stack.

**Conventions:**

- Scripts assume PowerShell 7+ (not legacy 5.1).
- Scripts must be CRLF (enforced by `.gitattributes`).
- Use `$ErrorActionPreference = 'Stop'` at the top of every script.
