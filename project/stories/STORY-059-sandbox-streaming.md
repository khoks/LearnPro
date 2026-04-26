---
id: STORY-059
title: Live stdout/stderr streaming for sandbox runs (split from STORY-006)
type: story
status: backlog
priority: P1
estimate: M
parent: EPIC-003
phase: v1
tags: [sandbox, websocket, streaming, ux]
created: 2026-04-26
updated: 2026-04-26
---

## Description

[STORY-006](./STORY-006-monaco-editor.md) shipped the Monaco playground hitting `POST /sandbox/run` (request/response). For long-running programs, the user has to wait for the program to finish before seeing any output — fine for the seed problem bank (which targets <5s programs), but a poor UX once we add freeform exercises, debugging-style tracks, or larger projects ([STORY-048](./STORY-048-project-based-learning.md)).

This Story adds a streaming primitive so the result panel can show stdout/stderr as they're emitted, not only after the process exits.

The Piston HTTP API is fundamentally request/response (the program runs to completion before anything is returned), so streaming requires either:

1. **Pin a different sandbox primitive in `SandboxProvider`** (e.g. spawn `docker run` directly with `--read-only --network none --cap-drop=ALL` and stream stdout/stderr lines back). This bypasses Piston for the streaming code path while keeping it as the fallback transport — `PistonSandboxProvider` continues to handle the non-streaming path.
2. **Or fake-stream by polling**: sandbox provider stays request/response; the Next.js Route Handler chunks the final output into newline-delimited tokens and emits them with artificial delay. Lower fidelity but zero infra change.

Pick one in the kickoff conversation. Option 1 is the right long-term answer; Option 2 is a viable shortcut if there's no time before [STORY-048](./STORY-048-project-based-learning.md).

## Acceptance criteria

- [ ] `SandboxProvider` exposes a streaming method (e.g. `runStream(req): AsyncIterable<SandboxRunChunk>`) alongside `run()`.
- [ ] API exposes the stream over either WebSocket or [Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events) (cheaper, sufficient for one-way stdout/stderr push).
- [ ] Web playground subscribes to the stream and appends to the result panel as chunks arrive (typed as `stdout` / `stderr` / `exit`).
- [ ] Hardening parity with the request/response path (`SandboxProvider` is the unit of trust — see [STORY-010](./STORY-010-sandbox-hardening.md)).
- [ ] Telemetry event still emits exactly once per run (on `exit` chunk).

## Dependencies

- Blocked by: STORY-010 (hardening — any new spawn primitive must pass the breakout suite).
- Related: STORY-048 (project-based learning — long-running programs are the main motivator).

## Notes

Filed during STORY-006 close-out (2026-04-26) when the WebSocket-streaming AC was descoped because Piston's HTTP API doesn't stream.

## Activity log

- 2026-04-26 — created (split from STORY-006).
