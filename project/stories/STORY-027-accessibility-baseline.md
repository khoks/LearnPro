---
id: STORY-027
title: Accessibility baseline (keyboard nav, Monaco screen-reader labels)
type: story
status: backlog
priority: P1
estimate: S
parent: EPIC-002
phase: mvp
tags: [accessibility, a11y, keyboard]
created: 2026-04-25
updated: 2026-04-25
---

## Description

The minimum a11y bar for MVP — not full WCAG AA conformance (that's a v1+ audit), but enough that we don't *exclude* keyboard-only users or screen-reader users by accident. Foundations:

- Every interactive element reachable by Tab, with visible focus rings.
- Skip link to main content (first focusable element).
- Monaco editor has explicit `aria-label`s and an "Esc to exit editor" shortcut documented.
- Color contrast meets WCAG AA on the default theme.
- All form inputs have associated `<label>`.
- No information conveyed by color alone (pass/fail badges have icons + text).

Full WCAG AA audit + fixes is in v1 (EPIC-002 v1 work).

## Acceptance criteria

- [ ] Tab order is logical on every page (verified manually).
- [ ] Visible focus ring on every focusable element (Tailwind `focus-visible:` utilities).
- [ ] Skip link present and works.
- [ ] Monaco has `aria-label` and Esc/Shift+F10 trap-exit documented in a tooltip.
- [ ] Lighthouse a11y score ≥ 90 on the dashboard, problem page, and settings page.

## Dependencies

- Blocked by: (works alongside other UI stories.)

## Tasks

(To be created when work begins.)

## Activity log

- 2026-04-25 — created
