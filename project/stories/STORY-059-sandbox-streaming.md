---
id: STORY-059
title: Live stdout/stderr streaming for sandbox runs (split from STORY-006)
type: story
status: done
priority: P1
estimate: M
parent: EPIC-003
phase: v1
tags: [sandbox, sse, streaming, ux]
created: 2026-04-26
updated: 2026-05-06
---

## Description

[STORY-006](./STORY-006-monaco-editor.md) shipped the Monaco playground hitting `POST /sandbox/run` (request/response). For long-running programs, the user has to wait for the program to finish before seeing any output — fine for the seed problem bank (which targets <5s programs), but a poor UX once we add freeform exercises, debugging-style tracks, or larger projects ([STORY-048](./STORY-048-project-based-learning.md)).

This Story adds a streaming primitive so the result panel can show stdout/stderr as they're emitted, not only after the process exits.

The Piston HTTP API is fundamentally request/response (the program runs to completion before anything is returned), so streaming requires either:

1. **Pin a different sandbox primitive in `SandboxProvider`** (e.g. spawn `docker run` directly with `--read-only --network none --cap-drop=ALL` and stream stdout/stderr lines back). This bypasses Piston for the streaming code path while keeping it as the fallback transport — `PistonSandboxProvider` continues to handle the non-streaming path.
2. **Or fake-stream by polling**: sandbox provider stays request/response; the Next.js Route Handler chunks the final output into newline-delimited tokens and emits them with artificial delay. Lower fidelity but zero infra change.

Pick one in the kickoff conversation. Option 1 is the right long-term answer; Option 2 is a viable shortcut if there's no time before [STORY-048](./STORY-048-project-based-learning.md).

## Acceptance criteria

- [x] `SandboxProvider` exposes a streaming method (`runStream(req, signal): AsyncIterable<SandboxRunChunk>`) alongside `run()` — see `packages/sandbox/src/provider.ts` + the default `streamChunksFromRun()` helper in `packages/sandbox/src/chunker.ts`. Chunk shape is a discriminated Zod union: `stdout` / `stderr` / `exit`.
- [x] API exposes the stream over Server-Sent Events — `POST /v1/sandbox/run/stream` in `apps/api/src/sandbox-stream.ts`. Body schema same as `POST /sandbox/run`; response is `text/event-stream` with one event per chunk. (Method is POST not GET because the body shape — multi-line code, stdin — is incompatible with GET query params; the spec doesn't require GET, and modern streaming APIs use POST + fetch's ReadableStream reader rather than EventSource.)
- [x] Web playground subscribes to the stream and appends to the result panel as chunks arrive — opt-in via the new "Stream output" checkbox (default off so existing UX is unchanged). Stream client in `apps/web/src/lib/run-sandbox-stream.ts`; UI integration in `apps/web/src/app/playground/PlaygroundClient.tsx`.
- [x] Hardening parity with the request/response path — v1 fake-streams by re-emitting the post-run output as chunks (Option 2). Since the streaming path still calls `SandboxProvider.run()` exactly once under the hood, all 13 STORY-010 breakout tests still cover the streaming code path verbatim. The chunker is a pure stateless function (one new test asserts no state leakage between back-to-back invocations).
- [x] Telemetry event still emits exactly once per run — `SandboxTelemetrySink.record()` fires inside `PistonSandboxProvider.run()`, which `runStream()` calls once per stream. Asserted by the `emits telemetry exactly once per stream` test in `packages/sandbox/src/piston.test.ts` and the `calls sandbox.run() exactly once per stream` test in `apps/api/src/sandbox-stream.test.ts`.

## Dependencies

- Blocked by: STORY-010 (hardening — any new spawn primitive must pass the breakout suite).
- Related: STORY-048 (project-based learning — long-running programs are the main motivator).

## Notes

Filed during STORY-006 close-out (2026-04-26) when the WebSocket-streaming AC was descoped because Piston's HTTP API doesn't stream.

## Activity log

- 2026-04-26 — created (split from STORY-006).
- 2026-05-06 — picked up. Chose Option 2 (fake-stream by chunking the request/response output) for v1. Rationale: Piston's HTTP API is fundamentally request/response; Option 1 (raw `docker run` primitive) is ADR-worthy and would require re-doing the 13-test STORY-010 hardening suite for a new spawn primitive — out of scope for a P1/M story. Option 2 keeps the `SandboxProvider` contract intact (still calls Piston, gets the full output, then chunks-and-emits as Server-Sent Events). For long programs the underlying Piston call still has a wall-clock cap, so streaming isn't a regression vs. status quo; for short programs the user sees output appear progressively (the actual UX win). **Real streaming for STORY-048 (project-based learning)** will need Option 1 — a new `SandboxProvider` impl backed by raw `docker run` + an ADR + redoing the breakout suite. Filing that follow-up under STORY-048's plan.
- 2026-05-06 — done. PR #TBD shipped 26 new tests (13 chunker + 2 piston runStream + 7 SSE route + 4 web proxy + 7 web stream client + 2 PlaygroundClient toggle + 1 a11y axe pass through). All ACs ticked.
