---
id: STORY-008
title: TypeScript sandbox runner via Piston
type: story
status: done
priority: P0
estimate: S
parent: EPIC-003
phase: mvp
tags: [sandbox, typescript, piston]
created: 2026-04-25
updated: 2026-04-26
---

## Description

Same shape as the Python runner (STORY-007), but for TypeScript. Piston has a `typescript` language preset that uses `ts-node` under the hood; we use it directly. No bundling, no `tsc` step — keep MVP simple.

Once STORY-007 is done, this story is mostly "add TS to the language allow-list and write the integration test."

## Acceptance criteria

- [x] TS code with `console.log('hello')` runs and returns expected stdout. *(Unit-tested via `FakePistonTransport`; integration test in `piston.integration.test.ts` runs against a real Piston when `PISTON_URL` is set.)*
- [x] TS-specific timeout/memory/output limits work as in STORY-007. *(`PistonSandboxProvider` is language-agnostic — same `classifyKilledBy` logic and `truncateBytes` apply. Unit test asserts timeout classification fires identically for TS.)*
- [ ] Same hardening checklist passes for the TS runner. *(Defer to STORY-010 — it owns `packages/sandbox/test/breakout/` and runs the breakout suite for every language.)*

## Dependencies

- Blocked by: STORY-007 (TS reuses the runner abstraction).

## Tasks

(To be created when work begins.)

## Activity log

- 2026-04-25 — created
- 2026-04-26 — done. Most of the work landed alongside STORY-007: `submission_language` enum already includes `typescript`, `SandboxLanguageSchema` already gates it, and `DEFAULT_PISTON_LANGUAGES` already maps it to `typescript@5.0.3` (Piston's built-in `ts-node`-based runner). This Story added: TS-specific unit tests asserting language-spec routing + timeout classification (`packages/sandbox/src/piston.test.ts`); a TS integration test gated on `PISTON_URL` (`piston.integration.test.ts`); an API test confirming `POST /sandbox/run` forwards `language: typescript` correctly. Hardening verification (no-net, ro rootfs, cgroups, seccomp, non-root) deferred to STORY-010 by design.
