---
id: STORY-066
title: Fix /dashboard ↔ /recommended infinite redirect loop for unrecognized target_role values
type: story
status: backlog
priority: P0
estimate: S
parent: EPIC-017
phase: v1
tags: [bug, auth, post-signin, redirect-loop]
created: 2026-05-11
updated: 2026-05-11
---

## Description

A signed-in user with `profiles.target_role` set to **any value not recognized by the role library** (any free-text answer from the deterministic onboarding fallback in `LEARNPRO_DISABLE_ONBOARDING_LLM=1` mode, plus any LLM answer that doesn't fuzzy-match a library slug) gets stuck in an infinite 307 loop:

1. Browser → `/dashboard` (after onboarding completes).
2. `/dashboard` calls `destinationForUser(user_id)` → returns `/recommended` because `episodes=0` and `target_role` is truthy (the check is just `if (target_role)`, not "is this a recognized role"). → 307 redirect.
3. `/recommended` calls `/api/recommendation`. Server returns `{ role: null, recommended_tracks: [], recommended_daily_minutes: null }` because `getRecommendation` does case-insensitive slug match and `"backend engineer"` ≠ `"backend-engineer"`. The page sees `!payload.role` and 307s to `/dashboard`.
4. GOTO 2.

Chrome shows `ERR_TOO_MANY_REDIRECTS`. Logs show 100+ alternating 307s per refresh.

Caught during the 2026-05-11 Chrome walkthrough.

## Acceptance criteria

- [ ] Fix `destinationFor` in `apps/web/src/auth/post-signin.ts` so it only returns `/recommended` when the user's `target_role` actually maps to a known role in the library. Two options, pick one:
  - **A.** Wire `getRecommendation` into `destinationFor` so the routing decision uses the same truth source as the page. Costs an extra DB-less library lookup; no Postgres round-trip.
  - **B.** Pass a sentinel cookie / query param when `/recommended` bails to `/dashboard`, and short-circuit the destinationFor check on the dashboard when the sentinel is present. Stateful, fragile, but no role-library coupling.
- [ ] Regression test: a Vitest + JSDOM unit test on `destinationFor` with `target_role: "Backend engineer"` (label, not slug) returns `/dashboard`, not `/recommended`.
- [ ] Regression test: a Vitest unit test on `/recommended/page.tsx`'s redirect path that asserts the bail-out path is exercised only when the API returns null role (no orchestration loop).
- [ ] Manual verification: complete onboarding with the deterministic fallback (`LEARNPRO_DISABLE_ONBOARDING_LLM=1`) and answer "Backend engineer" — landing page must be `/dashboard`, no redirect loop.

## Dependencies

- Related: STORY-067 (label-form acceptance in `getRecommendation`). Fixing 067 alone would mask 066 for common labels but not for genuinely unmappable text like "AI / ML researcher".

## Notes

This is a P0 because the deterministic onboarding fallback is the default path when `ANTHROPIC_API_KEY` is unset (i.e. every self-hoster who hasn't wired an API key), and the fallback produces label-form answers. Every such user currently lands in the redirect loop on first sign-in.

## Activity log

- 2026-05-11 — created. Found during /option 1/ Chrome walkthrough.
