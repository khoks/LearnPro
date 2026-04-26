---
id: STORY-005
title: Auth.js + bootstrap profile shell (conversational onboarding moved to STORY-053)
type: story
status: backlog
priority: P0
estimate: M
parent: EPIC-002
phase: mvp
tags: [auth, profile, nextauth]
created: 2026-04-25
updated: 2026-04-25
---

## Description

The first thing a new user sees. Auth.js (NextAuth) with **email magic link** + **GitHub OAuth** (the audience uses GitHub — making them sign in with it is signal-positive and reduces friction). After auth, **bootstrap an empty profile row** with sensible defaults so downstream agents have a row to read / write against; **then hand off to the conversational onboarding agent** ([STORY-053](./STORY-053-conversational-onboarding-agent.md)) which populates target role, time budget, languages-known, etc. through a candid chat.

This Story originally also included a 5-question structured form, but per the **Path A scope conversation (2026-04-25)** the form was replaced with the conversational onboarding agent and split into [STORY-053](./STORY-053-conversational-onboarding-agent.md). STORY-005 is now strictly **auth + profile-shell bootstrap + hand-off**.

## Acceptance criteria

- [ ] Email magic link sign-in works end-to-end (verify email arrives, click logs in).
- [ ] GitHub OAuth sign-in works end-to-end.
- [ ] On first login, a `profiles` row is created with `org_id` defaulted on self-hosted and all optional fields nullable.
- [ ] First login routes to [STORY-053](./STORY-053-conversational-onboarding-agent.md)'s conversational onboarding agent (or the minimal fallback structured form if the LLM provider is unavailable — the fallback is owned by STORY-053).
- [ ] Subsequent logins route directly to the dashboard.

## Dependencies

- Blocked by: STORY-013 (learner profile schema must exist), [STORY-052](./STORY-052-monorepo-skeleton.md) (skeleton).
- Blocks: [STORY-053](./STORY-053-conversational-onboarding-agent.md) (conversational onboarding hands off from here).

## Tasks

(To be created when work begins.)

## Activity log

- 2026-04-25 — created
- 2026-04-25 — re-scoped: structured-form onboarding split into [STORY-053](./STORY-053-conversational-onboarding-agent.md) (conversational onboarding agent) per Path A scope confirmation. STORY-005 is now strictly auth + profile-shell bootstrap.
