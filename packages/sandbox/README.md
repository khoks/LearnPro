# `@learnpro/sandbox`

`SandboxProvider` interface + Piston-on-Docker adapter, per [ADR-0002](../../docs/architecture/ADR-0002-sandbox.md).

## What's here

- `provider.ts` — single-method `SandboxProvider` interface (`run(req) → response`).
- `types.ts` — Zod schemas at the boundary: `SandboxRunRequestSchema`, `SandboxRunResponseSchema`, language and `killed_by` enums, telemetry event.
- `piston.ts` — `PistonSandboxProvider` (depends only on a `PistonTransport` interface — easy to fake in unit tests).
- `piston-http-transport.ts` — real `fetch`-based transport against a self-hosted Piston instance (default `http://localhost:2000`).
- `registry.ts` — `buildSandboxProvider()` factory + `loadSandboxConfigFromEnv()` (`PISTON_URL` → baseUrl override).
- `telemetry.ts` — null + in-memory `SandboxTelemetrySink` implementations.
- `errors.ts` — `SandboxRequestError`, `SandboxLanguageNotSupportedError`.

## Languages (MVP)

- `python` → Piston `python@3.10.0`
- `typescript` → Piston `typescript@5.0.3` (used by STORY-008)

Override per-language versions through `SandboxConfig.languages`.

## Tests

- `piston.test.ts` — unit tests with `FakePistonTransport`. Cover happy path, stdin forwarding, language spec mapping, timeout / OOM / output-limit / signal classification, telemetry, and zod input validation.
- `registry.test.ts` — config defaults, `PISTON_URL` env handling, `LEARNPRO_SANDBOX_CONFIG` JSON parsing.
- `piston.integration.test.ts` — gated on `PISTON_URL`; runs `print('hello')` and a runaway loop against a real Piston (start it via `infra/docker/docker-compose.dev.yaml`).

## What lives elsewhere

- **TS runner specifics**: STORY-008.
- **Hardening verification (no-net, ro rootfs, cgroups, seccomp, non-root)**: STORY-010 — every bullet from the ADR-0002 hardening checklist gets an automated breakout test in `packages/sandbox/test/breakout/`.
- **API wiring**: `apps/api/src/index.ts` exposes `GET /sandbox` (provider name) and `POST /sandbox/run` (zod-validated body → run result).
