---
id: EPIC-003
title: Code execution sandbox (containerized, hardened)
type: epic
status: backlog
priority: P0
phase: mvp
tags: [sandbox, security, infrastructure, docker]
created: 2026-04-25
updated: 2026-04-25
---

## Goal

Provide a safe, fast, multi-language code execution environment that runs entirely on the user's self-hosted setup (Windows + WSL2 in MVP). Wrap behind a `SandboxProvider` interface so we can swap to gVisor (Linux SaaS) and Firecracker (SaaS scale) later without touching agent or grading code.

## Scope

**MVP:**
- Self-hosted Piston in Docker on WSL2 for one-shot run-and-grade.
- `SandboxProvider` interface in `packages/sandbox`.
- Hardening checklist: no network, read-only rootfs, tmpfs `/tmp`, cgroups (CPU/mem/pids), wall-clock timeout, output truncation, drop all caps, non-root UID, seccomp profile. **Never `--privileged`.**
- WebSocket streaming of stdout/stderr.
- Hidden test case grading against user code.

**v1+:**
- Per-language runners for Go, Java, Rust, Kotlin, C.
- Multi-file workspaces with virtual filesystem persistence.
- Framework starter templates (React first; Spring/Hibernate/Angular in v2).
- Database-attached sandboxes for backend lessons (v2).

## Out of scope

- gVisor / Firecracker runtime (v3 / SaaS).
- Hosted services like CodeSandbox / StackBlitz (defeats self-hosted ethos).
- Collaborative cursors (v3).

## Stories under this Epic

- STORY-008 — Set up Piston in Docker on WSL2 (MVP)
- STORY-009 — Implement `SandboxProvider` interface (MVP)
- STORY-010 — Verify sandbox hardening checklist (MVP)

## Exit criteria (MVP)

- [ ] Python and TypeScript code runs reliably with sub-second latency for trivial programs.
- [ ] All hardening checklist items verified by an attempted-breakout exercise.
- [ ] `SandboxProvider` interface exists and is the only entry point used by agent / grader code.
- [ ] Resource quota violations produce clear user-facing error messages, not crashes.

## Related

- ADR: [`ADR-0002-sandbox`](../../docs/architecture/ADR-0002-sandbox.md)
- Vision: [`docs/vision/GROOMED_FEATURES.md`](../../docs/vision/GROOMED_FEATURES.md) § Theme 1

## Design notes & alternatives

See [`docs/product/UX_DETAILS.md § EPIC-003`](../../docs/product/UX_DETAILS.md#epic-003--containerized-code-sandbox) for the full deep-dive.

Key locked decisions for this Epic:
- **stdout streams live, line-by-line via WebSocket** (not batched at end). Long-running problems give a sense of progress; users see their `print` debug statements as the program runs — a real differentiator over "submit and wait" platforms.
- **One-shot containers for MVP** (~500ms cold-start). Pool of warm containers for stateful workspaces lands in v1.
- **Result panel shows three tabs:** Tests / Output / Errors. Hidden tests show only their *name* + pass/fail (e.g. "test_empty_input failed") — never reveal the input.
- **Error messages are framed as learning hints**, not security lectures. "Out of memory. Are you building a list bigger than necessary?" not "ResourceLimitExceeded."

Alternatives considered (WASM/Pyodide in-browser, serverless functions, persistent per-user containers): see UX_DETAILS for rationale.

## Activity log

- 2026-04-25 — created
