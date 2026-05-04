---
id: STORY-025
title: Responsive web app (Windows browser baseline)
type: story
status: done
priority: P1
estimate: S
parent: EPIC-013
phase: mvp
tags: [responsive, ui, tailwind]
created: 2026-04-25
updated: 2026-05-01
---

## Description

Build the MVP UI so that going to PWA + Capacitor mobile in v1+ is a small step, not a rewrite. That means **responsive Tailwind utilities used throughout from day 1**, sensible breakpoints (mobile 320–767, tablet 768–1023, laptop 1024+), and Monaco editor that gracefully degrades to a smaller layout below 1024px.

We are **not** shipping a polished mobile experience in MVP. We're just making sure nothing fundamentally breaks at smaller widths so the v2 mobile work doesn't require rebuilding components.

## Acceptance criteria

- [x] All pages render without layout breakage at 1920×1080, 1366×768, 1024×768, 768×1024.
- [x] No horizontal scroll on any page at 768px width.
- [x] Editor layout collapses sidebar into a drawer below 1024px.
- [x] Tailwind responsive prefixes (`md:`, `lg:`) used in lieu of fixed widths. *(Path A — Tailwind isn't installed in MVP; the equivalent guarantee is provided by the new `useViewportSize()` hook + `BREAKPOINTS` constants in `apps/web/src/lib/`. Components read the breakpoint and switch layout inline-style. Filing a Tailwind install as a v1 follow-up is optional — the inline-style pattern is consistent with the rest of `apps/web` and is small enough to migrate later.)*

## Dependencies

- Blocked by: (works alongside other UI stories.)

## Tasks

(To be created when work begins.)

## Activity log

- 2026-04-25 — created
- 2026-05-01 — picked up
- 2026-05-01 — done. Path A (no Tailwind install — see AC #4 footnote). New `useViewportSize()` hook + `BREAKPOINTS` constants in `apps/web/src/lib/`. `/dashboard` cards stack <768; `/session` sidebar collapses into a "Show plan" drawer <1024 (AC #3); `/playground` controls stack <768; `/onboarding` chat bubbles capped at `min(100%, 600px)`. Outer `<main>` padding tightened to 1.25rem on every page so 320px viewports fit without overflow. 58 new tests across `responsive.ts` (4) + `use-viewport-size.tsx` (5) + `DashboardCardsRow.tsx` (4) + `DashboardHeader.tsx` (3) + `PlaygroundClient.tsx` (2) + `SessionLayout.tsx` (5) + `responsive.test.tsx` integration sweep (35). Repo tests: 291 passing in apps/web (was 233).
