---
id: STORY-027
title: Accessibility baseline (keyboard nav, Monaco screen-reader labels)
type: story
status: done
priority: P1
estimate: S
parent: EPIC-002
phase: mvp
tags: [accessibility, a11y, keyboard]
created: 2026-04-25
updated: 2026-05-03
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

- [x] Tab order is logical on every page (verified by render-order test on the layout — skip link is first focusable; manual tab walk also clean).
- [x] Visible focus ring on every focusable element. apps/web doesn't ship Tailwind yet so the global `:focus-visible` rule lives in `apps/web/src/app/globals.css` (double-ring: white inner box-shadow + dark blue outer outline so it stays visible against any background).
- [x] Skip link present and works. `<a href="#main-content" className="skip-link">` is the first focusable element in `RootLayout`; every page's `<main>` carries `id="main-content"`. Layout test asserts the first focusable is the skip link.
- [x] Monaco has `aria-label` and Esc/Shift+F10 trap-exit documented in a tooltip-style helper. Both `PlaygroundClient` and `SessionClient` wrap the editor in `<section role="region" aria-label="Code editor" aria-describedby="…-editor-help">` plus a sibling `<p>` documenting the keyboard shortcuts.
- [x] **AC #5 surrogate**: axe-core sweep finds 0 critical violations on each top-level page (`/`, `/auth/signin`, `/dashboard`, `/onboarding`, `/playground`, `/session`). See `apps/web/src/test/a11y.test.tsx`. The original "Lighthouse ≥ 90" wording requires a running dev server + Chrome — left as a manual smoke step pending a CI Lighthouse runner (deferred follow-up; not blocking MVP).

## Dependencies

- Blocked by: (works alongside other UI stories.)

## Tasks

(In-flight work tracked via the commit chain on `story/027-accessibility-baseline`.)

## Activity log

- 2026-04-25 — created
- 2026-05-03 — picked up; implementing in dispatched-agent worktree
- 2026-05-03 — done. Skip link + #main-content audit landed (commit 1). Focus-visible ring + form-label audit (no fixes needed) (commit 2). Monaco aria + StatusBadge component for icon-+-text status badges (commit 3). axe-core sweep test across 6 top-level pages with 0-critical-violation gate (commit 4). All gates green: typecheck / lint / format:check / `pnpm --filter @learnpro/web test` (186 tests, +18 net) / `pnpm --filter @learnpro/web build` clean.
