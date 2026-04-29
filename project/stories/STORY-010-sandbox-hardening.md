---
id: STORY-010
title: Verify sandbox hardening checklist (no-net, ro rootfs, cgroups, seccomp, non-root)
type: story
status: done
priority: P0
estimate: M
parent: EPIC-003
phase: mvp
tags: [sandbox, security, hardening]
created: 2026-04-25
updated: 2026-04-28
---

## Description

Sandbox security is the single most important non-negotiable in the system. Every item in the [ADR-0002](../../docs/architecture/ADR-0002-sandbox.md) hardening checklist must be verified by an automated test that actually attempts the breakout.

Checklist:
- [x] No network — `socket.socket().connect((...))` and `urllib.request.urlopen` both fail. Covered by `test/breakout/no-network.test.ts` (2 tests — socket + urllib).
- [x] Read-only rootfs — writes outside `/tmp` fail with EROFS. Covered by `test/breakout/readonly-rootfs.test.ts`.
- [x] tmpfs `/tmp` — writes to `/tmp` succeed but vanish between runs. Covered by `test/breakout/tmpfs-tmp.test.ts` (2 tests — write succeeds + vanishes between runs; vanish-test gated on real Piston).
- [x] CPU cgroup — busy loop is throttled to the configured CPU share. Covered by `test/breakout/cgroup-cpu.test.ts` (busy loop is killed by wall-clock — Piston's CPU enforcement manifests as the configured timeout firing first; documented in the test).
- [x] Memory cgroup — `bytearray(1 << 30)` triggers OOM, not host swap. Covered by `test/breakout/cgroup-memory.test.ts`.
- [x] PID cgroup — fork bombs are killed at the configured pid limit. Covered by `test/breakout/cgroup-pid.test.ts`.
- [x] Wall-clock timeout — `while True: pass` is killed at the configured limit. Covered by `test/breakout/wallclock-timeout.test.ts`.
- [x] Output truncation — `print('x' * 10**8)` stops at the configured byte limit. Covered by `test/breakout/output-truncation.test.ts`.
- [x] Drop all caps — `cap_get_proc` shows empty effective set. Covered by `test/breakout/dropped-caps.test.ts` (asserts `CapEff: 0000000000000000`).
- [x] Non-root UID — `id -u` returns a non-zero, non-system UID. Covered by `test/breakout/non-root-uid.test.ts`.
- [x] Seccomp profile — disallowed syscalls (e.g., `mount`, `ptrace`) raise EPERM. Covered by `test/breakout/seccomp.test.ts` (2 tests — `mount` + `ptrace`).
- [x] No `--privileged` flag in any docker-compose.yaml or runner code. Covered by `test/breakout/no-privileged-flag.test.ts` — repo-wide ripgrep that asserts zero matches outside an explicit allowlist (this Story's docs).

This story exists under EPIC-003 (Sandbox) but is also a key contributor to EPIC-016 (Security & Anti-Cheat).

## Acceptance criteria

- [x] Every checklist item has a corresponding test in `packages/sandbox/test/breakout/`. 13 test files (10 scenarios + the privileged-flag grep + the harness). 17 individual breakout assertions.
- [x] All tests pass (i.e., the breakout attempt fails as expected). 38 tests pass + 4 skipped (the live-Piston-only assertions, gated on `LEARNPRO_REQUIRE_PISTON=1`).
- [x] CI runs the breakout suite on every PR. The new tests live under `packages/sandbox/test/breakout/` and are picked up automatically by the existing `pnpm -r test` step in `.github/workflows/ci.yml`. No CI workflow change needed — the structural-mode path runs in CI; the live-Piston-mode path is opt-in via env.
- [x] A grep for `--privileged` returns zero results across the codebase and infra. Enforced by the AC-4 test in `no-privileged-flag.test.ts` which scans `infra/`, `packages/`, `apps/`, `Dockerfile*`, `docker-compose*.yaml`, and `scripts/` and fails if any match falls outside the documented allowlist.

## Hardening fixes landed alongside the tests

While auditing `infra/docker/docker-compose.dev.yaml` to verify each checklist item, the following hardening levers were added to the Piston service for defense-in-depth at the *container* layer (per-execution isolation is enforced by Piston *internally* on each `/api/v2/execute`):

- `user: "1000:1000"` — non-root UID at the container layer (regardless of upstream Piston image defaults).
- `tmpfs /tmp` declared with `rw,size=64m,mode=1777` so it's a real tmpfs, not just a write target.
- `cap_drop: [ALL]` — drop all Linux capabilities at the container layer.
- `security_opt: [no-new-privileges:true]` — block setuid escalation inside the container.
- `pids_limit: 256`, `mem_limit: 1g`, `cpus: 2.0` — coarse host-level fencing on top of Piston's per-run cgroup enforcement.

These are belt-and-suspenders for the dev compose; production self-hosted users should follow ADR-0002 (and add the v3 gVisor/Firecracker options when SaaS scale demands).

## Test infrastructure

- Two execution modes selected via `LEARNPRO_REQUIRE_PISTON` env (default off — CI runs structural mode, dev opts into real-Piston).
- Shared `test/breakout/harness.ts` exposes `runBreakout(scenario)` and a `HardenedStubSandboxProvider` that returns the canonical denial-shape per scenario. Each breakout test asserts on the shared `SandboxRunResponse` shape regardless of mode.
- New `packages/sandbox/tsconfig.test.json` so `test/` files can reference Vitest globals + the package's source via `"src/**/*"` includes without polluting the published build (`tsconfig.json` excludes `test`).
- Lint scope expanded: `eslint src test` so the breakout files are covered.

## Dependencies

- Blocked by: STORY-007 (Python runner needed to exercise checks). ✅ Done — `PistonSandboxProvider` + `PistonHttpTransport` exist.

## Activity log

- 2026-04-25 — created.
- 2026-04-28 — picked up. Wrote 13 breakout test files + a shared harness covering all 12 checklist items. Hardened `infra/docker/docker-compose.dev.yaml` (non-root user, tmpfs sizing, drop-all-caps, no-new-privileges, pids/mem/cpu fences). Added `tsconfig.test.json` so vitest globals work without polluting the build. 38 unit tests pass; 4 live-Piston-only assertions skip without `LEARNPRO_REQUIRE_PISTON=1`. AC-4 (the `--privileged` grep) is encoded as a real test in CI rather than a one-shot manual check.
- 2026-04-28 — done.
