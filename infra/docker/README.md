# `infra/docker/`

Dockerfiles and docker-compose definitions for runtime infrastructure.

**Planned files (created during MVP build):**

- `docker-compose.dev.yaml` — local dev stack: Postgres+pgvector, Redis, MinIO, Piston runner, MailHog (for magic-link testing).
- `Dockerfile.runner` — base image for sandbox containers (Piston-managed; we may pin specific language images here for reproducibility).
- `Dockerfile.web` — production image for the Next.js app (multi-stage: deps → build → runtime).
- `seccomp.json` — seccomp profile for sandbox containers (per [ADR-0002](../../docs/architecture/ADR-0002-sandbox.md) hardening).

**Hard rules:**

- **Never** `--privileged`. If you think you need it, stop and ask in the ADR.
- All sandbox containers run as non-root, with read-only rootfs, tmpfs `/tmp`, dropped caps, no network.
- See the EPIC-016 hardening checklist for the full list.
