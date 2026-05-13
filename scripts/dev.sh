#!/usr/bin/env bash
# scripts/dev.sh — one-shot dev environment bootstrapper for LearnPro.
#
# What it does:
#   1. Verifies docker, pnpm, node are installed and the daemon is running.
#   2. Generates .env from a dev-safe template if missing.
#   3. Brings up the Docker stack (postgres + redis + minio + piston). Uses
#      docker-compose.dev.override.yaml when present to remap host ports past native
#      services (postgres → 15432, redis → 16379, minio → 19000/19001).
#   4. Runs `pnpm install` if node_modules isn't there.
#   5. Runs `pnpm db:bootstrap` (migrate + seed + concepts + tracks + problems).
#   6. Starts the API (apps/api on :4000) and Web (apps/web on :3000) in the background,
#      logging to .dev-logs/{api,web}.log.
#   7. Waits for both /health endpoints to return 200.
#   8. Opens your default browser to http://localhost:3000.
#   9. Tails both logs in the foreground with [api] / [web] prefixes.
#   On Ctrl+C / SIGTERM: kills the API and web processes and (unless --keep-docker)
#   runs `docker compose down` to stop containers. Volumes are preserved either way,
#   so your data survives between runs. Use --fresh to wipe the volumes too.
#
# Usage:
#   ./scripts/dev.sh                # normal run
#   ./scripts/dev.sh --keep-docker  # don't stop containers on exit
#   ./scripts/dev.sh --fresh        # wipe volumes + start clean
#   ./scripts/dev.sh --down         # just tear down (orphan recovery: dev.sh got killed
#                                     without its trap firing, leaving containers + servers
#                                     running). Stops dev servers on 3000/4000 + compose down.
#   ./scripts/dev.sh --help
#
# Tested on:
#   - Windows 11 + Git Bash (project's primary dev environment)
#   - macOS 14 + zsh-as-bash
#   - Ubuntu 22.04 + bash 5
#
# Self-host note (STORY-065): Piston requires writable cgroup v2. Docker Desktop on
# Windows does NOT expose it, so the Piston container restart-loops there and Run/Submit
# hang. We warn but don't block — everything else works.
#
# No-API-key note (STORY-070): the default .env disables LLM features that would otherwise
# 500 on first call (onboarding agent, Hint, today-plan, comprehension grader). Set
# `ANTHROPIC_API_KEY=...` in .env to enable them.

set -euo pipefail

# Find the repo root from the script's location, then cd there. Means you can run this
# from anywhere (`bash /abs/path/to/repo/scripts/dev.sh`) without breaking.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

# ─── flags ──────────────────────────────────────────────────────────────────
KEEP_DOCKER=0
FRESH=0
DOWN_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --keep-docker) KEEP_DOCKER=1 ;;
    --fresh)       FRESH=1 ;;
    --down)        DOWN_ONLY=1 ;;
    -h|--help)
      sed -n '2,48p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "Unknown flag: $arg" >&2; exit 2 ;;
  esac
done

# ─── pretty output ──────────────────────────────────────────────────────────
if [ -t 1 ]; then
  C_OK=$'\033[32m'; C_WARN=$'\033[33m'; C_ERR=$'\033[31m'
  C_INFO=$'\033[36m'; C_TAG=$'\033[35m'; C_DIM=$'\033[2m'; C_END=$'\033[0m'
else
  C_OK=""; C_WARN=""; C_ERR=""; C_INFO=""; C_TAG=""; C_DIM=""; C_END=""
fi
step() { printf "%s==> %s%s\n" "$C_INFO" "$*" "$C_END"; }
ok()   { printf "%s  ✓%s %s\n" "$C_OK"   "$C_END" "$*"; }
warn() { printf "%s  !%s %s\n" "$C_WARN" "$C_END" "$*"; }
err()  { printf "%s  ✗%s %s\n" "$C_ERR"  "$C_END" "$*" >&2; }

# ─── --down: orphan recovery shortcut ───────────────────────────────────────
# Use when dev.sh got killed without its trap firing (e.g. terminal crash, SIGKILL,
# parent process disappeared). Stops dev servers on 3000/4000 + docker compose down.
if [ "$DOWN_ONLY" = "1" ]; then
  step "Tearing down dev stack…"
  case "$(uname -s)" in
    MINGW*|MSYS*|CYGWIN*)
      # Windows: find PIDs listening on 3000/4000 and kill their trees.
      for port in 3000 4000; do
        pid=$(powershell.exe -Command "(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess" 2>/dev/null | tr -d '\r' | tail -1)
        if [ -n "$pid" ] && [ "$pid" != "0" ]; then
          taskkill //T //F //PID "$pid" >/dev/null 2>&1 && ok "Killed PID $pid on :$port" || warn "Couldn't kill PID $pid on :$port"
        fi
      done
      ;;
    *)
      for port in 3000 4000; do
        pid=$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | head -1)
        if [ -n "$pid" ]; then
          kill -TERM "$pid" 2>/dev/null && ok "Killed PID $pid on :$port" || warn "Couldn't kill PID $pid on :$port"
        fi
      done
      ;;
  esac
  COMPOSE_ARGS=(-f infra/docker/docker-compose.dev.yaml)
  if [ -f infra/docker/docker-compose.dev.override.yaml ]; then
    COMPOSE_ARGS+=(-f infra/docker/docker-compose.dev.override.yaml)
  fi
  docker compose "${COMPOSE_ARGS[@]}" down >/dev/null 2>&1 && ok "Containers stopped" || warn "compose down failed (already down?)"
  ok "Done."
  exit 0
fi

# ─── platform detection ─────────────────────────────────────────────────────
IS_WINDOWS=0
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*) IS_WINDOWS=1 ;;
esac

open_url() {
  local url="$1"
  if [ "$IS_WINDOWS" = "1" ]; then
    cmd.exe /c "start \"\" $url" >/dev/null 2>&1 || true
  elif [ "$(uname -s)" = "Darwin" ]; then
    open "$url" >/dev/null 2>&1 || true
  else
    (xdg-open "$url" >/dev/null 2>&1 &) || true
  fi
}

# Port-in-use check. Returns 0 if the TCP port is being listened on locally.
port_in_use() {
  local port="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -ltn 2>/dev/null | awk '{print $4}' | grep -E "(:|\.)${port}\$" >/dev/null
  elif command -v netstat >/dev/null 2>&1; then
    netstat -an 2>/dev/null | grep -E "[. :]${port}[ \t]" | grep -i LISTEN >/dev/null
  else
    return 1
  fi
}

# ─── 1/7 prereqs ────────────────────────────────────────────────────────────
step "1/7  Checking prerequisites…"
command -v docker >/dev/null || { err "docker not found in PATH";  exit 1; }
command -v pnpm   >/dev/null || { err "pnpm not found in PATH";    exit 1; }
command -v node   >/dev/null || { err "node not found in PATH";    exit 1; }
docker version --format '{{.Server.Version}}' >/dev/null 2>&1 || {
  err "Docker daemon isn't running. Start Docker Desktop (or the docker service) and retry."
  exit 1
}
ok "docker $(docker version --format '{{.Server.Version}}'), pnpm $(pnpm --version), node $(node --version)"

if port_in_use 3000; then err "Port 3000 is already in use. Stop whatever is using it and retry."; exit 1; fi
if port_in_use 4000; then err "Port 4000 is already in use. Stop whatever is using it and retry."; exit 1; fi
ok "Ports 3000 + 4000 are free"

# ─── 2/7 .env ───────────────────────────────────────────────────────────────
step "2/7  Loading .env…"
if [ ! -f .env ]; then
  warn ".env not found — generating with dev-safe defaults"
  cat > .env <<'ENVEOF'
# Generated by scripts/dev.sh on first run. Edit freely.

DATABASE_URL=postgresql://learnpro:learnpro@localhost:15432/learnpro
REDIS_URL=redis://localhost:16379
PISTON_URL=http://localhost:2000

NODE_ENV=development
APP_URL=http://localhost:3000
LEARNPRO_API_URL=http://localhost:4000

AUTH_SECRET=dev-only-secret-not-for-production-32chars-min-required-for-nextauth
NEXTAUTH_URL=http://localhost:3000

# No-LLM defaults so the app starts cleanly without an API key. Wire ANTHROPIC_API_KEY
# to enable hints / today-plan / comprehension grader / variants. See STORY-070 for the
# LLM-less fallback gap (Hint and today-plan currently surface 500 without a key).
LEARNPRO_DISABLE_ONBOARDING_LLM=1
LEARNPRO_VARIANT_SPEC_CLARITY_JUDGE=0
LEARNPRO_VARIANT_SELF_VALIDATE=0
LEARNPRO_DAILY_TOKEN_LIMIT=0
EMAIL_FROM="LearnPro <noreply@learnpro.local>"
ENVEOF
  ok "Wrote .env"
else
  ok ".env exists"
fi

# Next.js auto-loads apps/web/.env.local. apps/api inherits the spawning shell's env. To
# cover both with one source of truth, mirror .env into each app's local file too.
cp -f .env apps/web/.env.local
cp -f .env apps/api/.env.local

# Export everything in .env into THIS shell so the API server inherits it. We use a
# subshell with `set -a` so failures inside .env (e.g. malformed lines) don't kill us.
set -a; source ./.env; set +a

# ─── 3/7 pnpm install ───────────────────────────────────────────────────────
step "3/7  Ensuring dependencies…"
if [ ! -d node_modules ] || [ ! -d apps/api/node_modules ]; then
  pnpm install --frozen-lockfile
  ok "pnpm install complete"
else
  ok "node_modules present (skipping install — run 'pnpm install' manually if package.json changed)"
fi

# ─── 4/7 Docker stack ───────────────────────────────────────────────────────
step "4/7  Starting Docker stack (postgres + redis + minio + piston)…"
COMPOSE_ARGS=(-f infra/docker/docker-compose.dev.yaml)
if [ -f infra/docker/docker-compose.dev.override.yaml ]; then
  COMPOSE_ARGS+=(-f infra/docker/docker-compose.dev.override.yaml)
  ok "Using docker-compose.dev.override.yaml (host ports 15432/16379/19000/19001)"
fi

if [ "$FRESH" = "1" ]; then
  warn "--fresh: tearing down stack + volumes…"
  docker compose "${COMPOSE_ARGS[@]}" down -v 2>/dev/null || true
fi

docker compose "${COMPOSE_ARGS[@]}" up -d
ok "Containers up"

printf "%s     Waiting for Postgres…%s" "$C_DIM" "$C_END"
for i in $(seq 1 60); do
  if docker exec learnpro-postgres pg_isready -U learnpro -d learnpro >/dev/null 2>&1; then
    printf "\n"; ok "Postgres ready (after ${i}s)"; break
  fi
  printf "."
  sleep 1
  if [ "$i" = "60" ]; then printf "\n"; err "Postgres never came up. Check 'docker logs learnpro-postgres'."; exit 1; fi
done

# Piston preflight (STORY-065 — Windows Docker Desktop limitation).
if ! curl -sf http://localhost:2000/api/v2/runtimes >/dev/null 2>&1; then
  warn "Piston isn't reachable on :2000 (STORY-065)."
  warn "  On Windows Docker Desktop, Piston restart-loops because cgroup v2 isn't"
  warn "  writable inside the container. Run/Submit will hang; everything else works."
fi

# ─── 5/7 DB bootstrap ───────────────────────────────────────────────────────
step "5/7  Running migrations + seeding…"
mkdir -p .dev-logs
pnpm db:bootstrap > .dev-logs/bootstrap.log 2>&1 || {
  err "DB bootstrap failed. Last lines of .dev-logs/bootstrap.log:"
  tail -n 20 .dev-logs/bootstrap.log >&2
  exit 1
}
ok "Tracks + problems + concepts seeded"

# ─── 6/7 Start app servers ──────────────────────────────────────────────────
: > .dev-logs/api.log
: > .dev-logs/web.log

step "6/7  Starting API (:4000) and web (:3000)…"
# The API server doesn't read .env on its own (no dotenv import); we exported it above
# so the subshell inherits. Web (Next.js) reads apps/web/.env.local automatically.
( pnpm --filter @learnpro/api exec tsx watch src/index.ts ) > .dev-logs/api.log 2>&1 &
API_PID=$!
( pnpm --filter @learnpro/web dev )                          > .dev-logs/web.log 2>&1 &
WEB_PID=$!

# ─── cleanup trap ───────────────────────────────────────────────────────────
ALREADY_CLEANING=0
cleanup() {
  if [ "$ALREADY_CLEANING" = "1" ]; then return; fi
  ALREADY_CLEANING=1
  printf "\n"
  step "Shutting down…"
  if [ "$IS_WINDOWS" = "1" ]; then
    # Git Bash: bash PID isn't the leaf process. taskkill /T walks the tree.
    taskkill //T //F //PID "$API_PID" >/dev/null 2>&1 || true
    taskkill //T //F //PID "$WEB_PID" >/dev/null 2>&1 || true
  else
    # POSIX: kill the bash subshells AND their direct children.
    pkill -P "$API_PID" 2>/dev/null || true
    pkill -P "$WEB_PID" 2>/dev/null || true
    kill -TERM "$API_PID" "$WEB_PID" 2>/dev/null || true
  fi
  wait "$API_PID" 2>/dev/null || true
  wait "$WEB_PID" 2>/dev/null || true
  ok "API + web stopped"

  if [ "$KEEP_DOCKER" = "0" ]; then
    step "Stopping Docker containers (volumes preserved)…"
    docker compose "${COMPOSE_ARGS[@]}" down >/dev/null 2>&1 || true
    ok "Containers stopped"
  else
    warn "--keep-docker: leaving containers running. Stop them with:"
    warn "  docker compose ${COMPOSE_ARGS[*]} down"
  fi
  ok "Bye."
}
trap cleanup INT TERM EXIT

# ─── wait for health ────────────────────────────────────────────────────────
printf "%s     Waiting for servers to be ready…%s" "$C_DIM" "$C_END"
api_up=0; web_up=0
for i in $(seq 1 120); do
  if [ "$api_up" = "0" ] && curl -sf http://localhost:4000/health >/dev/null 2>&1; then api_up=1; fi
  if [ "$web_up" = "0" ] && curl -sf -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null | grep -q 200; then web_up=1; fi
  if [ "$api_up" = "1" ] && [ "$web_up" = "1" ]; then printf "\n"; break; fi
  printf "."
  sleep 1
  if [ "$i" = "120" ]; then printf "\n"; break; fi
done

if [ "$api_up" = "0" ]; then
  err "API server didn't come up in 120s. Last 30 lines of .dev-logs/api.log:"
  tail -n 30 .dev-logs/api.log >&2
  exit 1
fi
if [ "$web_up" = "0" ]; then
  err "Web server didn't come up in 120s. Last 30 lines of .dev-logs/web.log:"
  tail -n 30 .dev-logs/web.log >&2
  exit 1
fi
ok "API   → http://localhost:4000/health"
ok "Web   → http://localhost:3000"

# ─── 7/7 Browser + log tail ─────────────────────────────────────────────────
step "7/7  Opening browser…"
open_url "http://localhost:3000"
ok "Opened http://localhost:3000"

cat <<EOF

─────────────────────────────────────────────────────────────────────
 ${C_OK}LearnPro dev is running.${C_END}
   - Web      → http://localhost:3000
   - API      → http://localhost:4000
   - Postgres → localhost:15432  (learnpro/learnpro)
   - Redis    → localhost:16379
   - Logs     → .dev-logs/{api,web,bootstrap}.log

 Press ${C_OK}Ctrl+C${C_END} to stop everything (servers + containers).
─────────────────────────────────────────────────────────────────────

EOF

# Tail both logs with colored prefixes. The two background tails are killed by the
# EXIT trap when we get SIGINT.
( tail -F -n 0 .dev-logs/api.log 2>/dev/null | sed -u "s/^/${C_INFO}[api]${C_END} /" ) &
TAIL_API_PID=$!
( tail -F -n 0 .dev-logs/web.log 2>/dev/null | sed -u "s/^/${C_TAG}[web]${C_END} /" ) &
TAIL_WEB_PID=$!

# Extend cleanup to kill the tails too.
trap '
  kill "$TAIL_API_PID" "$TAIL_WEB_PID" 2>/dev/null || true
  cleanup
' INT TERM EXIT

# Wait for either app process to exit. If one dies, surface the error and shut down.
wait -n "$API_PID" "$WEB_PID" 2>/dev/null || true
err "One of the app servers exited unexpectedly. Last 30 lines of logs:"
tail -n 30 .dev-logs/api.log >&2
tail -n 30 .dev-logs/web.log >&2
exit 1
