#!/usr/bin/env bash
# Start the LearnPro local dev stack (Docker Compose) and the workspace dev servers.
# Linux variant. Requires Docker Engine, Node 20+, and pnpm 9.

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
compose_file="$repo_root/infra/docker/docker-compose.dev.yaml"

echo "==> Starting docker compose dev stack..."
docker compose -f "$compose_file" up -d

echo "==> Starting pnpm dev (apps/web + apps/api)..."
cd "$repo_root"
pnpm dev
