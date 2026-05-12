---
id: STORY-067
title: getRecommendation should accept label form, not just slug
type: story
status: backlog
priority: P1
estimate: XS
parent: EPIC-017
phase: v1
tags: [bug, recommendation, profile]
created: 2026-05-11
updated: 2026-05-11
---

## Description

`packages/profile/src/roleLibrary.ts::getRecommendation` currently does:

```ts
const needle = target_role.trim().toLowerCase();
return library.find((r) => r.slug.toLowerCase() === needle) ?? null;
```

It only matches slugs. But `profiles.target_role` stores whatever the onboarding agent (or its deterministic fallback) wrote — and the deterministic fallback writes the user's free-text reply like "Backend engineer" (the label, not "backend-engineer" the slug). Real-world result: every fallback-onboarded user gets `role: null` from `/api/recommendation`, which (via STORY-066) drives the redirect loop.

## Acceptance criteria

- [ ] Extend `getRecommendation` to match against `label` (case-insensitive, trimmed) in addition to `slug`. Slug match wins if both apply (defensive — labels can shadow slugs in pathological libraries).
- [ ] Add a Vitest case for label-form input: `getRecommendation(LIBRARY, "Backend engineer")` returns the `backend-engineer` role.
- [ ] Add a Vitest case for slug-form input that should still work: `getRecommendation(LIBRARY, "backend-engineer")` unchanged.
- [ ] Add a Vitest case for `"BACKEND ENGINEER"` (case-insensitive label).
- [ ] Add a Vitest case for unknown text: `getRecommendation(LIBRARY, "Quantum researcher")` still returns `null`.

## Dependencies

- Doesn't fix STORY-066 by itself (genuinely-unrecognized free text still loops), but reduces the population that hits the loop significantly.

## Notes

Optional stretch: add a fuzzy-match fallback (Levenshtein ≤ 2, or token-set similarity) so "Backend Eng." also resolves. Don't ship in this Story — keep the change tight.

## Activity log

- 2026-05-11 — created. Found during /option 1/ Chrome walkthrough.
