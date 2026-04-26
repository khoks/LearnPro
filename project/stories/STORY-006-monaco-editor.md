---
id: STORY-006
title: Monaco editor + run button + result panel
type: story
status: done
priority: P0
estimate: M
parent: EPIC-003
phase: mvp
tags: [editor, monaco, ui]
created: 2026-04-25
updated: 2026-04-26
---

## Description

The user-facing surface of the sandbox. Monaco editor (the same engine that powers VS Code — leverages users' existing muscle memory) embedded in a `/playground` route, with a **Run** button that hits the API's `POST /sandbox/run` and shows stdout/stderr/exit_code/duration in a result panel beneath. Language switcher gates Python and TypeScript (MVP allow-list).

This Story establishes the Monaco editor wiring + the Next.js → Fastify proxy that the rest of the UI work in EPIC-002 will build on.

## MVP scope (this Story)

- Monaco editor + language selector (Python / TypeScript).
- **Run** button → `fetch('/api/sandbox/run')` (Next.js Route Handler) → forwards to Fastify `POST /sandbox/run` → renders the response.
- Result panel: stdout, stderr, exit_code, duration_ms, killed_by, runtime_version. Color-cues for pass/fail.
- Keyboard nav baseline (focus trap inside editor + Esc to exit).

## Out of MVP scope (split into follow-ups)

- **Live token-by-token streaming via WebSocket** — Piston's HTTP API is request/response (the program runs to completion before any output is returned), so true streaming requires either polling or a different sandbox primitive. Filed as [STORY-059](./STORY-059-sandbox-streaming.md).
- **Submit button + hidden test runner** — depends on a problem entity + hidden test fixtures, which land in [STORY-016](./STORY-016-seed-bank.md). The Submit UX will be added there.
- **Editor language follows the problem language** — also requires the problem entity. Until then, the playground keeps a user-controlled language selector. Re-wires once [STORY-016](./STORY-016-seed-bank.md) lands.

## Acceptance criteria

- [x] Monaco editor renders on `/playground` and accepts code input.
- [x] Language selector toggles between `python` and `typescript`; Monaco language mode follows the selector.
- [x] Run button POSTs to `/api/sandbox/run`, which proxies to the Fastify API; the result panel renders stdout, stderr, exit_code, duration_ms, killed_by, and runtime_version.
- [x] Failed runs (non-zero exit, killed_by set, transport error) are visually distinct from successful runs.
- [x] Editor is keyboard-navigable: focus trap inside Monaco; Esc moves focus out (Monaco's built-in `editor.action.toggleTabFocusMode` + native blur).
- [x] Unit tests cover the Next.js Route Handler proxy + the browser-side `runSandbox` helper.
- [ ] Monaco loads in <500ms warm cache. *(Manual; not enforced in CI — perf budget tracking will land with the responsive-web Story (STORY-025).)*
- [ ] Live stdout/stderr streaming via WebSocket. *(Out of scope — see [STORY-059](./STORY-059-sandbox-streaming.md).)*
- [ ] Submit button + hidden tests. *(Out of scope — see [STORY-016](./STORY-016-seed-bank.md).)*
- [ ] Editor language follows the problem language. *(Out of scope — re-wires when [STORY-016](./STORY-016-seed-bank.md) lands.)*

## Dependencies

- Blocked by: STORY-007 (Python runner) ✅ + STORY-008 (TS runner) ✅.
- Blocks: nothing structural; STORY-016 will hook into the same `/playground` shell when it lands.

## Tasks

(Tracked inline in the activity log.)

## Activity log

- 2026-04-25 — created
- 2026-04-26 — picked up. Re-scoped to drop streaming + submit + problem-language ACs (filed STORY-059 for streaming; submit deferred to STORY-016).
- 2026-04-26 — done. Added Monaco-based `/playground` page (`apps/web/src/app/playground/`) with language selector (Python/TS), Run button, and a result panel that surfaces stdout / stderr / exit_code / duration_ms / killed_by / runtime_version. Wiring path: browser → Next.js Route Handler `POST /api/sandbox/run` (re-validates with `SandboxRunRequestSchema` + proxies to Fastify) → Fastify `POST /sandbox/run`. Added `SandboxRunRequestInput` type to `@learnpro/sandbox` (z.input vs. z.infer split) so callers don't need to pre-fill defaults. 17 new web tests (4 helper + 6 route handler + 7 status). Filed [STORY-059](./STORY-059-sandbox-streaming.md) for the deferred WebSocket-streaming AC.
