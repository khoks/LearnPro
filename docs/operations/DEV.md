# Running LearnPro locally

> One command brings the whole stack up: `bash scripts/dev.sh`.
> Ctrl+C stops the servers AND the Docker containers.

## Prerequisites

- **Docker** (Desktop on Win/Mac, the daemon on Linux) — running.
- **pnpm 9.x** — `npm i -g pnpm@9` if you don't have it.
- **Node 20+** — anything modern works.

## The fast path

```bash
bash scripts/dev.sh
```

That's it. The script:

1. Verifies the prereqs above.
2. Generates `.env` from a dev-safe template if you don't have one.
3. Starts the Docker stack (Postgres, Redis, MinIO, Piston) on remapped host ports
   to avoid colliding with anything else on your machine:
   - Postgres → `localhost:15432` (creds `learnpro/learnpro`)
   - Redis    → `localhost:16379`
   - MinIO    → `localhost:19000` (API) / `localhost:19001` (console)
   - Piston   → `localhost:2000`  (the only one not remapped)
4. Installs deps if `node_modules` is missing.
5. Runs `pnpm db:bootstrap` — migrate + seed concepts + seed tracks + seed problems.
   Fresh DB → 206 concepts + 428 prerequisite edges + 2 tracks + 182 problems.
6. Starts the API (`apps/api` on `:4000`) and Web (`apps/web` on `:3000`) in the
   background. Logs go to `.dev-logs/{api,web}.log`.
7. Waits for `/health` on both, then opens `http://localhost:3000` in your browser.
8. Tails both logs in the foreground with `[api]` / `[web]` prefixes.

Press **Ctrl+C** to stop everything. The script kills the API + web processes and
runs `docker compose down` (volumes preserved — your data survives between runs).

## Flags

```bash
bash scripts/dev.sh --keep-docker   # leave containers running on exit
bash scripts/dev.sh --fresh         # nuke containers AND volumes (re-bootstraps DB)
bash scripts/dev.sh --down          # orphan recovery: kill dev servers + containers
                                    # (use when the script got SIGKILLed without trapping)
bash scripts/dev.sh --help          # show this list
```

## What works without an API key

The default `.env` sets `LEARNPRO_DISABLE_ONBOARDING_LLM=1` and disables the
LLM-judge / self-validation gates so the app starts cleanly without an
`ANTHROPIC_API_KEY`. With no key, you get:

- ✓ Magic-link signin (link printed to the web log)
- ✓ Onboarding (deterministic 3-question state machine)
- ✓ Recommended tracks page
- ✓ Dashboard + all settings pages
- ✓ Session page renders problems with Monaco editor + file tree
- ✓ Paste-detect modal + "I got help" toggle
- ✗ Hint, Today's plan, Submit-grading — require the LLM (filed as STORY-070)
- ✗ Run / Submit on Windows — Piston needs writable cgroup v2 which Docker
      Desktop on Windows doesn't expose (filed as STORY-065). Mac/Linux Docker
      works fine.

To unlock the LLM-dependent surfaces, add `ANTHROPIC_API_KEY=sk-ant-…` to `.env`
and re-run the script.

## Walking the happy path

1. Run `bash scripts/dev.sh`.
2. Wait for the browser to open `http://localhost:3000`.
3. Click **`/auth/signin`**, enter any email, hit **Email me a magic link**.
4. Look at the foreground log for a `[web] [auth] magic link for you@example.com: http://...`
   line. Copy that URL into the browser address bar.
5. Step through the 3-question onboarding (role / minutes per day / goal).
6. You'll land on `/recommended` with role-mapped tracks. Click one.
7. You're in `/session` with a real problem in Monaco. Try the paste-detect
   modal by pasting code; toggle "I got help on this one"; etc.

## Cleaning up data between runs

```bash
docker compose -f infra/docker/docker-compose.dev.yaml \
               -f infra/docker/docker-compose.dev.override.yaml down -v
```

…or just run `bash scripts/dev.sh --fresh`.

## Troubleshooting

- **"Port 3000 / 4000 is already in use"** — something else is using the port.
  `netstat -an | grep :3000` to find it; kill that process.
- **Piston in restart loop** — see STORY-065. On Windows you can ignore it
  unless you need to run code; everything else works.
- **DB bootstrap fails** — check `.dev-logs/bootstrap.log`. Most common cause is
  Postgres not fully ready; just rerun the script.
- **Magic link doesn't arrive** — without `EMAIL_SERVER` set, the link is logged
  to the web dev server's stdout (visible in your foreground tail) — you grab it
  from there and paste into the address bar.
