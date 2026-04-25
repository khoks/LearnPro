---
id: STORY-025
title: Responsive web app (Windows browser baseline)
type: story
status: backlog
priority: P1
estimate: S
parent: EPIC-013
phase: mvp
tags: [responsive, ui, tailwind]
created: 2026-04-25
updated: 2026-04-25
---

## Description

Build the MVP UI so that going to PWA + Capacitor mobile in v1+ is a small step, not a rewrite. That means **responsive Tailwind utilities used throughout from day 1**, sensible breakpoints (mobile 320–767, tablet 768–1023, laptop 1024+), and Monaco editor that gracefully degrades to a smaller layout below 1024px.

We are **not** shipping a polished mobile experience in MVP. We're just making sure nothing fundamentally breaks at smaller widths so the v2 mobile work doesn't require rebuilding components.

## Acceptance criteria

- [ ] All pages render without layout breakage at 1920×1080, 1366×768, 1024×768, 768×1024.
- [ ] No horizontal scroll on any page at 768px width.
- [ ] Editor layout collapses sidebar into a drawer below 1024px.
- [ ] Tailwind responsive prefixes (`md:`, `lg:`) used in lieu of fixed widths.

## Dependencies

- Blocked by: (works alongside other UI stories.)

## Tasks

(To be created when work begins.)

## Activity log

- 2026-04-25 — created
