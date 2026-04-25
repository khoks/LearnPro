---
id: STORY-005
title: Auth.js + 5-question onboarding
type: story
status: backlog
priority: P0
estimate: M
parent: EPIC-002
phase: mvp
tags: [auth, onboarding, nextauth]
created: 2026-04-25
updated: 2026-04-25
---

## Description

The first thing a new user sees. Auth.js (NextAuth) with **email magic link** + **GitHub OAuth** (the audience uses GitHub — making them sign in with it is signal-positive and reduces friction). After auth, a 5-question onboarding flow seeds the learner profile:

1. Target role (e.g., "backend engineer", "ML engineer", "switching from data analyst").
2. Languages already known + comfort level (1–5 each).
3. Time budget per day (15 / 30 / 60 / 90+ minutes).
4. Primary goal (interview prep / new job / hobby / academic).
5. Self-assessed level (beginner / intermediate / advanced).

These answers seed the initial track recommendation, daily reminder time, and difficulty bias.

## Acceptance criteria

- [ ] Email magic link sign-in works end-to-end (verify email arrives, click logs in).
- [ ] GitHub OAuth sign-in works end-to-end.
- [ ] Onboarding renders only on first login; subsequent logins go to the dashboard.
- [ ] Onboarding answers persist to the `profiles` table with `org_id` defaulted on self-hosted.
- [ ] Skipping any question is allowed; defaults are recorded.

## Dependencies

- Blocked by: STORY-013 (learner profile schema must exist).

## Tasks

(To be created when work begins.)

## Activity log

- 2026-04-25 — created
