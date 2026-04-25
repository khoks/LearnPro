# `scripts/linux/`

Linux-specific scripts (bash). **Stub for now** — to be filled in when the SaaS deployment target (likely Linux servers under gVisor/Firecracker) lands in v3.

**Planned scripts:**

- `bootstrap.sh` — install Docker Engine (not Desktop), install Node 20, install `pnpm`, set up `.env`, run migrations.
- `start-dev.sh` / `stop-dev.sh` — same shape as the Mac scripts.
- `prod-deploy.sh` — production deploy helper (v3 SaaS).

**Conventions:** same as `scripts/mac/`. Distribution-agnostic (target Ubuntu LTS as the canonical baseline; if scripts diverge by distro, split into subdirectories).
