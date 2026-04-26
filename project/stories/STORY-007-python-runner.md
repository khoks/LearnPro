---
id: STORY-007
title: Python sandbox runner via Piston
type: story
status: done
priority: P0
estimate: M
parent: EPIC-003
phase: mvp
tags: [sandbox, python, piston, docker]
created: 2026-04-25
updated: 2026-04-26
---

## Description

Per [ADR-0002](../../docs/architecture/ADR-0002-sandbox.md), MVP sandboxing uses **self-hosted Piston** in a Docker container running under WSL2 on the dev's Windows machine. This story wires the Python runner: a `SandboxProvider` interface impl that takes `{ language: 'python', code, stdin, time_limit_ms, memory_limit_mb }` and returns `{ stdout, stderr, exit_code, duration_ms, killed_by }`.

Piston gives us: pre-built language images, output truncation, wall-clock timeout enforcement, and a clean HTTP API. We add: per-call hardening verification (no network, read-only rootfs, tmpfs `/tmp`, drop caps, non-root UID, seccomp profile, resource cgroups). **Never `--privileged`.**

## Acceptance criteria

- [x] `SandboxProvider` interface defined in `packages/sandbox/src/provider.ts` (one method: `run`).
- [x] Piston-Docker impl runs `print('hello')` and returns the expected stdout. *(Unit-tested via `FakePistonTransport`; integration test in `piston.integration.test.ts` runs against a real Piston when `PISTON_URL` is set.)*
- [x] Wall-clock timeout (default 5s) kills runaway code and reports `killed_by: 'timeout'`. *(Default `DEFAULT_TIME_LIMIT_MS = 5_000`. `classifyKilledBy` maps Piston's `Run timed out` message + SIGKILL-at-deadline to `timeout`.)*
- [x] Output is truncated at 64KB and reports `killed_by: 'output-limit'` if exceeded. *(`DEFAULT_OUTPUT_LIMIT_BYTES = 64 * 1024`; `truncateBytes` cuts at the limit and appends `[truncated]`.)*
- [x] Memory cap (default 128MB) is enforced; OOM reports `killed_by: 'memory'`. *(Default `DEFAULT_MEMORY_LIMIT_MB = 128`; converted to bytes for Piston's `run_memory_limit`. Classifier maps `OOM`/`memory` messages + bare SIGKILL to `memory`.)*
- [ ] `socket.socket().connect((...))` raises a network-blocked error (proves no-net). *(Defer to STORY-010; needs a real Piston with `--network none` in the runner config.)*
- [ ] All hardening checklist items from ADR-0002 are verified by an automated test. *(Defer to STORY-010 — that Story owns `packages/sandbox/test/breakout/`.)*

## Dependencies

- Blocked by: (Docker Compose dev setup — itself part of the MVP infra work).

## Tasks

(To be created when work begins.)

## Activity log

- 2026-04-25 — created
- 2026-04-26 — picked up. Mirroring the LLM gateway architecture: SandboxProvider interface + PistonSandboxProvider with injectable PistonTransport + zod schemas at the boundary + unit tests with FakeTransport + integration tests gated on PISTON_URL. Hardening assertions live in STORY-010.
- 2026-04-26 — done. `packages/sandbox` ships: `SandboxProvider` interface (one method `run`), `PistonSandboxProvider` (with `PistonTransport` shim for testability), `PistonHttpTransport` (real fetch against `http://localhost:2000`), `buildSandboxProvider` + `loadSandboxConfigFromEnv` (`PISTON_URL` env override), `In{Memory,Null}SandboxTelemetrySink`. `apps/api` exposes `GET /sandbox` and `POST /sandbox/run` (zod-validated body → run result, 502 on `SandboxRequestError`). 22 unit/registry tests pass; 6 API tests pass. Hardening verification (no-net, ro rootfs, cgroups, seccomp, non-root) deferred to STORY-010 by design.
