# scripts\dev.ps1 — PowerShell wrapper around scripts\dev.sh for Windows users who don't
# have Git Bash on their PATH (or have Windows' WSL-relay bash.exe shadowing it). Locates
# Git for Windows' real bash.exe and invokes the bash script with the user's flags.
#
# Usage (from PowerShell or cmd.exe):
#   powershell -ExecutionPolicy Bypass -File scripts\dev.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\dev.ps1 --fresh
#   powershell -ExecutionPolicy Bypass -File scripts\dev.ps1 --down
#
# Or from PowerShell directly (if execution policy allows):
#   .\scripts\dev.ps1
#
# Why this wrapper exists:
#   - Windows ships its own C:\Windows\System32\bash.exe that routes to WSL. If you don't
#     have a WSL distro installed, you get
#       <3>WSL (xxx - Relay) ERROR: CreateProcessCommon:800: execvpe(/bin/bash) failed:
#         No such file or directory
#     This wrapper bypasses that by calling Git for Windows' bash.exe directly.

$ErrorActionPreference = "Stop"

# Find Git for Windows' bash.exe. Try the common install locations in order.
$candidates = @(
  "$env:ProgramFiles\Git\bin\bash.exe",
  "$env:ProgramFiles\Git\usr\bin\bash.exe",
  "${env:ProgramFiles(x86)}\Git\bin\bash.exe",
  "${env:ProgramFiles(x86)}\Git\usr\bin\bash.exe",
  "$env:LocalAppData\Programs\Git\bin\bash.exe"
)

# Also try resolving via `git --exec-path` — works when Git is on PATH but in an unusual spot.
$gitCmd = Get-Command git -ErrorAction SilentlyContinue
if ($gitCmd) {
  $gitDir = Split-Path -Parent $gitCmd.Source
  $candidates += "$gitDir\bash.exe"
  $candidates += "$gitDir\..\bin\bash.exe"
  $candidates += "$gitDir\..\usr\bin\bash.exe"
}

$bashExe = $null
foreach ($c in $candidates) {
  if ($c -and (Test-Path $c -PathType Leaf)) {
    $bashExe = (Resolve-Path $c).Path
    break
  }
}

if (-not $bashExe) {
  Write-Host ""
  Write-Host "ERROR: Could not find Git for Windows' bash.exe." -ForegroundColor Red
  Write-Host ""
  Write-Host "Either install Git for Windows (https://git-scm.com/download/win), or run" -ForegroundColor Yellow
  Write-Host "this script from a Git Bash terminal directly:" -ForegroundColor Yellow
  Write-Host ""
  Write-Host "    bash scripts/dev.sh" -ForegroundColor Cyan
  Write-Host ""
  Write-Host "Tried these paths:" -ForegroundColor DarkGray
  foreach ($c in $candidates) { Write-Host "    $c" -ForegroundColor DarkGray }
  exit 1
}

# Resolve the script's directory and the bash script we want to run.
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$bashScript = Join-Path $scriptDir "dev.sh"
if (-not (Test-Path $bashScript -PathType Leaf)) {
  Write-Host "ERROR: dev.sh not found next to dev.ps1: $bashScript" -ForegroundColor Red
  exit 1
}

# Translate the Windows-style path to a form Git Bash accepts. Git Bash handles both
# "D:/...\path" and Unix-style "/d/..." paths; we use forward-slashed Windows so users
# see a familiar location in any error messages.
$bashScriptUnix = $bashScript -replace '\\', '/'

# Run the bash script with all of our args passed through. We deliberately avoid --login
# (skip the user's .bash_profile which may pollute the env) and -i (skip interactive
# rc loading which slows startup). The script itself manages its own environment.
& $bashExe $bashScriptUnix @args
exit $LASTEXITCODE
