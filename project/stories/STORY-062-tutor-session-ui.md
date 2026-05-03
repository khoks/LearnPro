---
id: STORY-062
title: Tutor session UI (/session page wiring the 4 tutor API routes)
type: story
status: backlog
priority: P0
estimate: M
parent: EPIC-002
phase: mvp
tags: [ui, tutor, mvp-loop]
created: 2026-05-01
updated: 2026-05-01
---

## Description

STORY-011 shipped the tutor agent + 4 API routes (`POST /v1/tutor/episodes`, `/episodes/:id/hint`, `/episodes/:id/submit`, `/episodes/:id/finish`). The MVP loop is now API-complete. This Story adds the user-facing `/session` page that wires those routes.

As a learner, I can land on `/session?track=python-fundamentals`, get assigned a problem, write code in Monaco, click "Run" / "Submit" / "Hint", and see grading + hints inline. On finish, I'm bounced back to `/dashboard` (or shown "next problem" CTA).

## Acceptance criteria

- [ ] New `apps/web/src/app/session/page.tsx` — assigns a problem on mount, renders the problem statement, wires Monaco for the editor, exposes Run / Submit / Hint (rung 1/2/3) / Finish controls.
- [ ] Hint history rendered inline below the problem statement; XP cost shown next to each rung button.
- [ ] Grade results rendered in a result panel: pass/fail, rubric (3 bars), prose explanation, hidden test results table.
- [ ] On finish, render the skill-update summary + a "next problem" CTA that calls `/v1/tutor/episodes` again.
- [ ] Auth-gated via the existing Auth.js session cookie (same as `/playground` / `/onboarding`).
- [ ] 429 (TokenBudgetExceededError) and 409 (IllegalTransitionError) → friendly inline banners; do not crash the session.
- [ ] Playwright smoke test (or vitest+react-testing-library) — covers the assign → submit (pass) → finish path against a mocked fetch.

## Tasks under this Story

(Created when work begins.)

## Dependencies

- Blocked by: STORY-011 (tutor agent + API routes — done 2026-05-01).

## Notes

The agent harness, ports, and 4 tools are stable; this Story is pure UI wiring. Reuse the Monaco wrapper from `/playground`. The `useInteractionCapture` hook from STORY-055 should fire on every edit / run / submit.

## Activity log

- 2026-05-01 — created (filed by STORY-011 as a follow-up — the brief explicitly deferred UI to a separate Story)
