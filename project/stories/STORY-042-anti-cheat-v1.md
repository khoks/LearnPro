---
id: STORY-042
title: Anti-cheat v1 — paste detection + "I got help" honesty toggle
type: story
status: backlog
priority: P1
estimate: M
parent: EPIC-016
phase: v1
tags: [anti-cheat, honesty, profile, v1]
created: 2026-04-25
updated: 2026-04-25
---

## Description

MVP only logs `paste_ratio` silently. v1 adds a respectful, non-punitive honesty system:

1. **Paste-detect modal**: when a user pastes a substantial block of code (>20 chars or >30% of current file), a non-blocking modal appears: "Looks like you pasted some code — was this yours, or do you want to mark it as 'got help'?" Two buttons: `My code` / `I got help`. Dismissable; default is `My code`.
2. **Always-available "I got help on this one" toggle** in the result panel — off by default. When on, the submission is graded normally but does NOT count toward concept mastery (skill score gets no bump).
3. **Profile transparency**: profile page shows "X problems marked 'got help'" stat, framed as "you're being honest with the system, which makes adaptiveness sharper."

## Acceptance criteria

- [ ] Paste-detect modal triggers on pastes > 20 chars OR > 30% of editor content. Single occurrence per paste, non-blocking.
- [ ] "I got help" toggle in result panel; persists per-submission.
- [ ] Profile field `got_help: bool` on each episode; consumed by skill-update logic.
- [ ] Profile page shows "got help" stat with friendly framing.
- [ ] Tutor NEVER accuses (covered by tutor pedagogy in EPIC-004 — this story does not weaken that).
- [ ] Tutor reads `got_help` flag and adjusts response: "Cool — let me walk you through what this code does so you actually own the technique."

## Tasks under this Story

(To be created when this Story is picked up.)

## Dependencies

- Blocked by: EPIC-002 MVP loop (STORY-006 — editor + result panel).

## Notes

- See [`docs/product/UX_DETAILS.md § Cheating detection philosophy`](../../docs/product/UX_DETAILS.md#cheating-detection-philosophy) — this story implements that philosophy.
- Honesty mode (paste-lock) is a SEPARATE v2 feature (not in this story) — see catalog.
- Catalogued in [`docs/vision/RECOMMENDED_ADDITIONS.md`](../../docs/vision/RECOMMENDED_ADDITIONS.md).

## Activity log

- 2026-04-25 — created
