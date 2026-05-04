---
id: STORY-062
title: Tutor session UI (/session page wiring the 4 tutor API routes)
type: story
status: done
priority: P0
estimate: M
parent: EPIC-002
phase: mvp
tags: [ui, tutor, mvp-loop]
created: 2026-05-01
updated: 2026-05-03
---

## Description

STORY-011 shipped the tutor agent + 4 API routes (`POST /v1/tutor/episodes`, `/episodes/:id/hint`, `/episodes/:id/submit`, `/episodes/:id/finish`). The MVP loop is now API-complete. This Story adds the user-facing `/session` page that wires those routes.

As a learner, I can land on `/session?track=python-fundamentals`, get assigned a problem, write code in Monaco, click "Run" / "Submit" / "Hint", and see grading + hints inline. On finish, I'm bounced back to `/dashboard` (or shown "next problem" CTA).

## Acceptance criteria

- [x] New `apps/web/src/app/session/page.tsx` — assigns a problem on mount, renders the problem statement, wires Monaco for the editor, exposes Run / Submit / Hint (rung 1/2/3) / Finish controls.
- [x] Hint history rendered inline below the problem statement; XP cost shown next to each rung button.
- [x] Grade results rendered in a result panel: pass/fail, rubric (3 bars), prose explanation, hidden test results table.
- [x] On finish, render the skill-update summary + a "next problem" CTA that calls `/v1/tutor/episodes` again.
- [x] Auth-gated via the existing Auth.js session cookie (same as `/playground` / `/onboarding`).
- [x] 429 (TokenBudgetExceededError) and 409 (IllegalTransitionError) → friendly inline banners; do not crash the session.
- [x] vitest integration test (`session-driver.test.ts`) covers the assign → submit (pass) → finish path against a mocked fetch — landed in lieu of Playwright (RTL+jsdom not yet wired in apps/web; orchestration extracted into pure driver functions per the brief's fallback plan).

## Tasks under this Story

(Closed without a separate Task split — single-PR story.)

## Dependencies

- Blocked by: STORY-011 (tutor agent + API routes — done 2026-05-01). UNBLOCKED.

## Notes

Implementation summary:

- Pure state machine in `apps/web/src/lib/session-state.ts` (discriminated union: `assigning | coding | hint_loading | submitting | grading | finishing | finished | error`) + a `transition(state, event)` reducer; tested with 41 unit tests covering every legal transition + every illegal-event-on-state.
- Pure orchestration layer in `apps/web/src/lib/session-driver.ts` — `driveAssign / driveSubmit / driveHint / driveFinish` call the tutor-api wrappers and return `{ state, events }`. Production component uses these directly so the integration test exercises the real path.
- 4 Next.js Route Handlers under `apps/web/src/app/api/tutor/episodes/...` proxy to apps/api's `/v1/tutor/episodes/*` and forward the Auth.js session cookie. Zod-validate the body before forwarding. 29 tests across the 4 `route.test.ts` files.
- `apps/web/src/app/session/SessionClient.tsx` (client) + `page.tsx` (server-component, auth-gated). Reuses the Monaco dynamic-import wrapper from `/playground`. Wires `useInteractionCapture` so cursor / edit / revert telemetry flows on the editor; emits `submit` (with `passed`) + `hint_request` + `hint_received` interaction events around the tutor calls.
- Visual layer extracted into `session-view.tsx` + pure `session-view-helpers.ts` (rubric color buckets, percentage clamping, outcome humanization, expected/got formatting, delta arrow classification, badge palette). 11 unit tests on the helpers.
- Friendly inline banner for 401 / 403 / 404 / 409 / 429 / 502 / 503 — never blank-screens.
- The hint button is a SINGLE button (per STORY-017 AC #1) — text reads `Hint (rung N)` and the rung escalates 1 → 2 → 3 on each click; disabled after rung 3.

Total apps/web tests: **155 passing** (was 90 before this Story).

## Activity log

- 2026-05-01 — created (filed by STORY-011 as a follow-up — the brief explicitly deferred UI to a separate Story)
- 2026-05-03 — picked up
- 2026-05-03 — done
