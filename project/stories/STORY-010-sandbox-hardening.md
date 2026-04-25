---
id: STORY-010
title: Verify sandbox hardening checklist (no-net, ro rootfs, cgroups, seccomp, non-root)
type: story
status: backlog
priority: P0
estimate: M
parent: EPIC-003
phase: mvp
tags: [sandbox, security, hardening]
created: 2026-04-25
updated: 2026-04-25
---

## Description

Sandbox security is the single most important non-negotiable in the system. Every item in the [ADR-0002](../../docs/architecture/ADR-0002-sandbox.md) hardening checklist must be verified by an automated test that actually attempts the breakout.

Checklist:
- [ ] No network — `socket.socket().connect((...))` and `urllib.request.urlopen` both fail.
- [ ] Read-only rootfs — writes outside `/tmp` fail with EROFS.
- [ ] tmpfs `/tmp` — writes to `/tmp` succeed but vanish between runs.
- [ ] CPU cgroup — busy loop is throttled to the configured CPU share.
- [ ] Memory cgroup — `bytearray(1 << 30)` triggers OOM, not host swap.
- [ ] PID cgroup — fork bombs are killed at the configured pid limit.
- [ ] Wall-clock timeout — `while True: pass` is killed at the configured limit.
- [ ] Output truncation — `print('x' * 10**8)` stops at the configured byte limit.
- [ ] Drop all caps — `cap_get_proc` shows empty effective set.
- [ ] Non-root UID — `id -u` returns a non-zero, non-system UID.
- [ ] Seccomp profile — disallowed syscalls (e.g., `mount`, `ptrace`) raise EPERM.
- [ ] No `--privileged` flag in any docker-compose.yaml or runner code.

This story exists under EPIC-003 (Sandbox) but is also a key contributor to EPIC-016 (Security & Anti-Cheat).

## Acceptance criteria

- [ ] Every checklist item has a corresponding test in `packages/sandbox/test/breakout/`.
- [ ] All tests pass (i.e., the breakout attempt fails as expected).
- [ ] CI runs the breakout suite on every PR.
- [ ] A grep for `--privileged` returns zero results across the codebase and infra.

## Dependencies

- Blocked by: STORY-007 (Python runner needed to exercise checks).

## Tasks

(To be created when work begins.)

## Activity log

- 2026-04-25 — created
