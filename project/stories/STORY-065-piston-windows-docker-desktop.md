---
id: STORY-065
title: Piston sandbox fundamentally broken on Docker Desktop for Windows (cgroup v2 unavailable)
type: story
status: backlog
priority: P1
estimate: M
parent: EPIC-003
phase: v1
tags: [bug, sandbox, piston, windows, self-host]
created: 2026-05-11
updated: 2026-05-11
---

## Description

The Piston sandbox container (`ghcr.io/engineer-man/piston`) requires a writable cgroup v2 filesystem at `/sys/fs/cgroup` — its `docker-entrypoint.sh` does `mkdir isolate/` directly under `/sys/fs/cgroup` to set up per-execution isolation. Docker Desktop on Windows does NOT expose a writable cgroup v2 mount to arbitrary containers (the WSL2 backend's cgroup behavior is restricted), so Piston enters a restart loop spamming `mkdir: cannot create directory 'isolate/': Read-only file system`.

Result: the Run/Submit button in /playground and /session hangs indefinitely, because `apps/api`'s SandboxProvider calls into a Piston that's perpetually restarting. This blocks **every** code-execution flow in the app for Windows self-hosters.

Caught during the 2026-05-11 Chrome walkthrough — clicking Run in /playground caused the page to hang for 30+ seconds and Chrome to drop the screenshot CDP call.

## Acceptance criteria

- [ ] Document Windows dev-stack limitations in `infra/docker/README.md` — Piston requires Linux or macOS Docker; Windows must use WSL2-native Docker (not Docker Desktop's WSL2-integrated daemon).
- [ ] Add a `health` endpoint check in apps/api's startup that pings Piston and logs a loud warning if it returns non-200, so an operator sees the problem before clicking Run.
- [ ] Decide on a fallback strategy: either (a) ship judge0 as an alternative sandbox provider for Windows-Docker-Desktop users, (b) document the WSL2-native Docker workaround in the self-host guide, or (c) document the limitation and leave Run disabled with a clear message.
- [ ] If we add a fallback provider, it should plug into the existing `SandboxProvider` interface so the rest of the app needs no changes.

## Dependencies

- ADR-0002 (sandbox decision) — re-read; consider whether judge0 belongs as a documented alternative for self-hosters with broken cgroup v2.

## Notes

This is a real blocker for the "self-host on any platform" positioning. Most Mac/Linux Docker setups work fine; Windows is the outlier. Worth documenting prominently in the self-host README so users don't burn time discovering this themselves.

Tested 2026-05-11 with Docker Desktop 29.3.0 on Windows 11 + WSL2 backend. Piston's `docker-entrypoint.sh` log: `mkdir: cannot create directory 'isolate/': Read-only file system` repeating ~50 times before container marked Restarting.

## Activity log

- 2026-05-11 — created. Found during /option 1/ Chrome walkthrough.
