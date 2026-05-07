---
id: STORY-037b
title: Bug-finding scores dashboard card (STORY-037a UI follow-up)
type: story
status: in-progress
priority: P2
estimate: S
parent: EPIC-007
phase: v1-followup
tags: [dashboard, debugging, scoring, v1, follow-up, ui]
created: 2026-05-06
updated: 2026-05-06
---

## Description

STORY-037a wired the runtime persistence path so `bug_finding_scores` rows actually move on each
debug-problem submission, and exposed `GET /v1/bug-finding-scores`. This follow-up surfaces those
scores on the dashboard via a new `<BugFindingScoresCard>` component — small UI follow-up to make
the per-archetype EWMAs visible to the learner.

The scoring axis is presented as **growth, not deficit**: never a percentile, never a raw number,
never "weakness" framing. We render a humanized archetype name + a low/medium/high band + an
attempt counter — no rankings, no comparisons.

## Acceptance criteria

- [ ] New `<BugFindingScoresCard>` component renders a row per archetype with: humanized
      archetype name (e.g. "Off-by-one", "Mutation in iteration", "Reference equality"), score
      surfaced as a low/medium/high band (never a raw number, never a percentile, no shaming),
      attempt count.
- [ ] Coach-voice copy: card heading "Bug archetypes you've worked through" — never "weakness"
      or "gap" framing. Scores reframed as growth, not deficit.
- [ ] Empty state (no debug-problem submissions yet, or every archetype has 0 attempts):
      "Try a debug problem to see your bug-finding scores here." — coach-voice.
- [ ] Sort: highest-attempts first (most-touched archetypes first); ties broken by archetype name.
- [ ] Score → band mapping in a pure helper (`apps/web/src/lib/bug-finding-band.ts`):
      `score < 0.4 → "still learning"`, `0.4 <= score <= 0.7 → "getting there"`,
      `score > 0.7 → "solid"`. (Centred on 0.5 cold-start; `bug-finding-policy` returns scores
      in [0, 1].)
- [ ] New Next.js Route Handler proxy at `apps/web/src/app/api/bug-finding-scores/route.ts`
      forwards the cookie to the API's `GET /v1/bug-finding-scores`.
- [ ] Card mounted on `/dashboard` page.
- [ ] Forbidden-phrase test ensures the card never uses "weakness", "DON'T", "you're failing",
      etc. and reframes the bug-finding score as growth, not deficit.
- [ ] axe-core regression test extends the existing dashboard a11y sweep with the new card
      visible.
- [ ] Component render tests cover empty state, partial state (some archetypes touched, some
      not), full state, and the highest-attempts-first sort.
- [ ] Pure band-mapping unit tests cover the band boundaries.

## Dependencies

- Blocked by: STORY-037a (the API route + DB helpers + EWMA wiring).

## Notes

This was carved out of STORY-037a to keep the follow-up reviewable. The hard parts (table,
prompt, EWMA persistence, Fastify route) are already in main. This Story is purely UI surface area.

## Activity log

- 2026-05-06 — created (carved out of STORY-037a)
- 2026-05-06 — picked up
