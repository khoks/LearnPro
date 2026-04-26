#requires -Version 7

<#
.SYNOPSIS
  Stop the LearnPro local dev Docker stack (does NOT delete volumes).
#>

$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path "$PSScriptRoot/../.."
$composeFile = Join-Path $repoRoot 'infra/docker/docker-compose.dev.yaml'

Write-Host "==> Stopping docker compose dev stack..." -ForegroundColor Cyan
docker compose -f $composeFile down
