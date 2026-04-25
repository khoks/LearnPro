---
id: STORY-007
title: Python sandbox runner via Piston
type: story
status: backlog
priority: P0
estimate: M
parent: EPIC-003
phase: mvp
tags: [sandbox, python, piston, docker]
created: 2026-04-25
updated: 2026-04-25
---

## Description

Per [ADR-0002](../../docs/architecture/ADR-0002-sandbox.md), MVP sandboxing uses **self-hosted Piston** in a Docker container running under WSL2 on the dev's Windows machine. This story wires the Python runner: a `SandboxProvider` interface impl that takes `{ language: 'python', code, stdin, time_limit_ms, memory_limit_mb }` and returns `{ stdout, stderr, exit_code, duration_ms, killed_by }`.

Piston gives us: pre-built language images, output truncation, wall-clock timeout enforcement, and a clean HTTP API. We add: per-call hardening verification (no network, read-only rootfs, tmpfs `/tmp`, drop caps, non-root UID, seccomp profile, resource cgroups). **Never `--privileged`.**

## Acceptance criteria

- [ ] `SandboxProvider` interface defined in `packages/sandbox/src/provider.ts` (one method: `run`).
- [ ] Piston-Docker impl runs `print('hello')` and returns the expected stdout.
- [ ] Wall-clock timeout (default 5s) kills runaway code and reports `killed_by: 'timeout'`.
- [ ] Output is truncated at 64KB and reports `killed_by: 'output-limit'` if exceeded.
- [ ] Memory cap (default 128MB) is enforced; OOM reports `killed_by: 'memory'`.
- [ ] `socket.socket().connect((...))` raises a network-blocked error (proves no-net).
- [ ] All hardening checklist items from ADR-0002 are verified by an automated test.

## Dependencies

- Blocked by: (Docker Compose dev setup — itself part of the MVP infra work).

## Tasks

(To be created when work begins.)

## Activity log

- 2026-04-25 — created
