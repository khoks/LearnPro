---
id: EPIC-011
title: Gamification (XP, streaks, progress, badges) — humane
type: epic
status: backlog
priority: P1
phase: mvp
tags: [gamification, engagement, xp, streaks]
created: 2026-04-25
updated: 2026-04-25
---

## Goal

Make progress visible and rewarding without resorting to dark patterns. Show the user their growth — XP, streaks, per-category mastery — but never use FOMO, loss aversion, or manipulative push to drive engagement.

**Foundational principle (non-negotiable):** No dark patterns. No leaderboards by default. No streak-loss panic. Grace days exist to forgive missed days.

## Scope

**MVP:**
- XP awarded per problem (less for hints used).
- Daily streak counter with **3 grace days per month**.
- Per-track progress bars (% of curated problems passed).

**v1+:**
- Badges for concept mastery (earned by passing rubric thresholds).
- Skill heatmap visualization.
- Pomodoro / break reminders (per [recommended additions](../../docs/vision/RECOMMENDED_ADDITIONS.md)).

**v2+:**
- Weekly leaderboard (opt-in only).

**v3+:**
- Seasonal challenges (time-bound, opt-in).

## Out of scope

- Crypto / NFT badges (deliberately de-prioritized).
- Avatar / 3D progression elements.
- Public-by-default social proof.

## Stories under this Epic

- STORY-022 — XP, streak with grace days, per-track progress bar (MVP)

## Exit criteria (MVP)

- [ ] XP, streak, and progress are visible on the dashboard at all times.
- [ ] Streak grace days are documented in the UI (not hidden mechanics).
- [ ] No notification ever uses urgency or fear language.

## Related

- Vision: [`docs/vision/GROOMED_FEATURES.md`](../../docs/vision/GROOMED_FEATURES.md) § Theme 8
- Recommended additions: Pomodoro / break reminders

## Activity log

- 2026-04-25 — created
