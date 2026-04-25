# `infra/scripts/`

Cross-cutting infra scripts that aren't OS-specific (those live in `scripts/{windows,mac,linux}/`).

**Planned scripts (created during MVP build):**

- `bootstrap.sh` / `bootstrap.ps1` — first-run dev environment setup (verify Docker, WSL2, Node 20, pnpm; pull seed images; run initial migrations; seed a demo user).
- `migrate.sh` / `migrate.ps1` — wrapper around `drizzle-kit migrate` with environment-validation guards.
- `db-reset.sh` / `db-reset.ps1` — wipe + re-seed dev DB. **Refuses to run with `NODE_ENV=production`.**
- `eval-prompts.sh` — run the prompt-eval harness (v1).

OS-specific bootstraps live alongside in `scripts/windows/bootstrap.ps1`, `scripts/mac/bootstrap.sh`, `scripts/linux/bootstrap.sh`.
