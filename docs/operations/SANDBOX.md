# Code execution sandbox (Piston) — operator guide

LearnPro uses [Piston](https://github.com/engineer-man/piston) as the sandbox that runs
user-submitted Python and TypeScript. Inside its container Piston wires per-execution
isolation via cgroup v2 (`/sys/fs/cgroup/isolate/...`).

This works fine on Linux Docker and macOS Docker. **It does NOT work on Docker Desktop
for Windows** — the WSL2 backend behind Docker Desktop doesn't expose a writable cgroup
v2 mount, so Piston's entrypoint hits

```
mkdir: cannot create directory 'isolate/': Read-only file system
```

…and the container goes into a restart loop. Every `Run` / `Submit` then surfaces

```
Run failed
sandbox_unavailable — Piston execute failed
```

This page is the operator guide for unblocking it. Tracked as
[STORY-065](../../project/stories/STORY-065-piston-windows-docker-desktop.md).

---

## Option A — WSL-native Docker engine (recommended for Windows self-hosters)

The fix that keeps the "your data stays on your machine" promise. ~30 min.

1. Install a real Ubuntu (or Debian / Arch) WSL distro:
   ```powershell
   wsl --install -d Ubuntu-24.04
   ```
   Reboot if WSL was freshly enabled. Sign in to the distro once, set a user.

2. Inside that distro, install the docker engine (NOT Docker Desktop):
   ```bash
   curl -fsSL https://get.docker.com | sh
   sudo usermod -aG docker $USER
   newgrp docker     # or log out + back in
   ```

3. Confirm cgroup v2 is mounted RW (this is the bit Docker Desktop's distro doesn't give us):
   ```bash
   mount | grep cgroup2
   # Expect:   cgroup2 on /sys/fs/cgroup type cgroup2 (rw,nosuid,nodev,noexec,relatime)
   ```

4. Run the LearnPro docker compose stack from inside the WSL distro:
   ```bash
   cd /mnt/d/DEV/ClaudeProjects/LearnPro     # or wherever your checkout is
   docker compose -f infra/docker/docker-compose.dev.yaml \
                  -f infra/docker/docker-compose.dev.override.yaml up -d
   docker logs -f learnpro-piston            # should NOT say "Read-only file system"
   curl -sSf http://localhost:2000/api/v2/runtimes | head
   ```

5. Run `bash scripts/dev.sh` from either Git Bash on Windows OR the WSL distro
   itself — `PISTON_URL=http://localhost:2000` already points at the right port.

Why this works: docker-engine running inside a real Linux WSL distro hands containers
the kernel's actual cgroup v2 hierarchy, which is writable. Docker Desktop's internal
distro is intentionally locked down.

---

## Option B — point at a remote Piston instance

If you have a Linux VM somewhere (a $5/month DigitalOcean droplet works), run Piston
there and point `PISTON_URL` at it. Your code leaves the local machine — the privacy
story is weaker — but no Windows-specific setup.

On the VM:
```bash
docker run -d --name piston -p 2000:2000 ghcr.io/engineer-man/piston
```

On your dev box (`.env`):
```env
PISTON_URL=https://piston.your-vm.example.com
```

…then `bash scripts/dev.sh --down && bash scripts/dev.sh` to pick up the new URL.

You'll want HTTPS in front of the VM (Caddy or a Cloudflare tunnel work) and IP-allowlist
the Piston port so randoms can't run code through your instance.

---

## Option C — public Piston API (no longer viable)

Before 2026-02-15 you could point `PISTON_URL` at `https://emkc.org/api/v2/piston` and
get free public execution. As of 2026-02-15 that API is whitelist-only — you have to
contact EngineerMan on Discord with a use-case justification. Not a path for casual
self-hosters anymore.

---

## Option D — skip Run/Submit, use the rest of the app

If you're poking at LearnPro for design/UX feedback and don't need real code execution,
everything else works on Docker Desktop Windows:

- Auth, onboarding (deterministic fallback)
- Dashboard, /recommended, all settings pages
- Session page renders real problems with Monaco editor
- Paste-detect modal, "I got help" toggle
- /playground UI shell (just Run / Submit are blocked)

The dev script already prints a warning when Piston isn't healthy, so this mode is the
default if you don't act on it.

---

## Why isn't there a default fallback to a different sandbox?

The `SandboxProvider` interface in `packages/sandbox/src/` is pluggable, but every
production-grade alternative we evaluated (judge0, nsjail) has the same cgroup-v2
dependency on Docker Desktop Windows. The real fix is "don't run the sandbox under
Docker Desktop on Windows" — Options A and B both honor that.

A lighter alternative — an in-process Pyodide for Python-only execution — would
unblock /playground but break feature parity with the curated TypeScript track and
the integration tests that assume Piston-compatible semantics. Filed as a v2
consideration in the STORY-065 activity log; not on the v1 roadmap.
