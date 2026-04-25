---
id: STORY-008
title: TypeScript sandbox runner via Piston
type: story
status: backlog
priority: P0
estimate: S
parent: EPIC-003
phase: mvp
tags: [sandbox, typescript, piston]
created: 2026-04-25
updated: 2026-04-25
---

## Description

Same shape as the Python runner (STORY-007), but for TypeScript. Piston has a `typescript` language preset that uses `ts-node` under the hood; we use it directly. No bundling, no `tsc` step — keep MVP simple.

Once STORY-007 is done, this story is mostly "add TS to the language allow-list and write the integration test."

## Acceptance criteria

- [ ] TS code with `console.log('hello')` runs and returns expected stdout.
- [ ] TS-specific timeout/memory/output limits work as in STORY-007.
- [ ] Same hardening checklist passes for the TS runner.

## Dependencies

- Blocked by: STORY-007 (TS reuses the runner abstraction).

## Tasks

(To be created when work begins.)

## Activity log

- 2026-04-25 — created
