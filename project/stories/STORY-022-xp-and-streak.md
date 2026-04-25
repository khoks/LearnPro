---
id: STORY-022
title: XP, streak with grace days, per-track progress bar
type: story
status: backlog
priority: P0
estimate: S
parent: EPIC-011
phase: mvp
tags: [gamification, xp, streak]
created: 2026-04-25
updated: 2026-04-25
---

## Description

The minimal gamification surface for MVP — **no dark patterns, no FOMO, no shame loops**.

- **XP** awarded per problem (base XP × difficulty × correctness multiplier, minus hint costs).
- **Streak** tracks consecutive practice days, with **2 free grace days per month** (Duolingo-style streak shield, given for free, not paid). Skipping a day inside a grace window does not break the streak; the user is informed they used a grace day.
- **Per-track progress bar** showing concepts mastered / total. No leaderboards in MVP (opt-in leaderboards are v1+).
- Notifications never use urgency or shame language ("DON'T LOSE YOUR STREAK!!" is explicitly disallowed — see EPIC-011 out-of-scope).

## Acceptance criteria

- [ ] XP increments on grade and persists to `users.xp`.
- [ ] Streak tracks consecutive `episode`-having days, respecting grace days.
- [ ] Grace days replenish on the 1st of each month (cap 2).
- [ ] Per-track progress bar reflects concept mastery.
- [ ] No notification copy contains "don't lose", "DAY X", "burn", or 🔥/⚠️ emoji.

## Dependencies

- Blocked by: STORY-013 (`users` and `episodes` tables).

## Tasks

(To be created when work begins.)

## Activity log

- 2026-04-25 — created
