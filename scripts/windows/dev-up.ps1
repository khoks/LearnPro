#requires -Version 7

<#
.SYNOPSIS
  Start the LearnPro local dev stack (Docker Compose) and the workspace dev servers.

.DESCRIPTION
  Brings up the docker-compose stack (postgres + redis + minio + piston),
  then runs `pnpm dev` (Turborepo) to start apps/web (port 3000) and apps/api (port 4000).
#>

$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path "$PSScriptRoot/../.."
$composeFile = Join-Path $repoRoot 'infra/docker/docker-compose.dev.yaml'

Write-Host "==> Starting docker compose dev stack..." -ForegroundColor Cyan
docker compose -f $composeFile up -d

Write-Host "==> Starting pnpm dev (apps/web + apps/api)..." -ForegroundColor Cyan
Push-Location $repoRoot
try {
  pnpm dev
}
finally {
  Pop-Location
}
