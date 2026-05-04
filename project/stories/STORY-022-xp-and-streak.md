---
id: STORY-022
title: XP, streak with grace days, per-track progress bar
type: story
status: done
priority: P0
estimate: S
parent: EPIC-011
phase: mvp
tags: [gamification, xp, streak]
created: 2026-04-25
updated: 2026-05-03
---

## Description

The minimal gamification surface for MVP — **no dark patterns, no FOMO, no shame loops**.

- **XP** awarded per problem (base XP × difficulty × correctness multiplier, minus hint costs).
- **Streak** tracks consecutive practice days, with **2 free grace days per month** (Duolingo-style streak shield, given for free, not paid). Skipping a day inside a grace window does not break the streak; the user is informed they used a grace day.
- **Per-track progress bar** showing concepts mastered / total. No leaderboards in MVP (opt-in leaderboards are v1+).
- Notifications never use urgency or shame language ("DON'T LOSE YOUR STREAK!!" is explicitly disallowed — see EPIC-011 out-of-scope).

## Acceptance criteria

- [x] XP increments on grade and persists to `users.xp`.
- [x] Streak tracks consecutive `episode`-having days, respecting grace days.
- [x] Grace days replenish on the 1st of each month (cap 2).
- [x] Per-track progress bar reflects concept mastery.
- [x] No notification copy contains "don't lose", "DAY X", "burn", or 🔥/⚠️ emoji. (Scoped to dashboard copy — there is no notification system yet; STORY-023 lands the in-app notification center and must honor the same rule. The dashboard component test in `apps/web/src/app/dashboard/dashboard-components.test.tsx` explicitly asserts the absence of these phrases across every variant.)

## Dependencies

- Blocked by: STORY-013 (`users` and `episodes` tables).

## Tasks

(All shipped within this Story — no separate Task files needed.)

## Activity log

- 2026-04-25 — created
- 2026-05-03 — picked up
- 2026-05-03 — done. Schema: `users.xp` + `users.streak_grace_days_remaining` + `users.streak_grace_last_replenished_at` + new `xp_awards` table (migration `0005_xp_streak.sql`) with `(user_id, episode_id, reason)` unique constraint. Pure policies in `@learnpro/scoring`: `awardXpForEpisode` (configurable XP table, `[5, 15, 30]` hint-cost ladder per STORY-017) + `computeStreak` (UTC-day step, monthly-replenishing grace, "graces don't dangle" semantics so they only commit when bridging to a real episode day). DB helpers in `@learnpro/db/xp-streak.ts`: idempotent `awardXp` (ON CONFLICT DO NOTHING + conditional `users.xp` increment), lazy `replenishGraceDays`, `getStreakInputs`/`getStreakSnapshot`, `getActiveTrackSlugs`, `getTrackProgress` (concept-tag count vs `skill_scores.confidence >= 50`). Tutor's `updateProfile` tool now calls `awardXp` on episode close — surfaces `xp_award` in its output. Real `/dashboard` page replaces the placeholder: 3 pure components (`XpCard` / `StreakCard` / `TrackProgressBar`), coach-voice copy, "Start a session" CTA. ~50 new tests (8 xp-policy + 17 streak-policy + 7 schema + 18 db-integration + 7 tool + 13 component). Notification copy ACs scoped to dashboard; STORY-023 carries the rule forward when the notification system lands.
