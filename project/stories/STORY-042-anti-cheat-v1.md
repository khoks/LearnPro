---
id: STORY-042
title: Anti-cheat v1 — paste detection + "I got help" honesty toggle
type: story
status: done
priority: P1
estimate: M
parent: EPIC-016
phase: v1
tags: [anti-cheat, honesty, profile, v1]
created: 2026-04-25
updated: 2026-05-06
---

## Description

MVP only logs `paste_ratio` silently. v1 adds a respectful, non-punitive honesty system:

1. **Paste-detect modal**: when a user pastes a substantial block of code (>20 chars or >30% of current file), a non-blocking modal appears: "Looks like you pasted some code — was this yours, or do you want to mark it as 'got help'?" Two buttons: `My code` / `I got help`. Dismissable; default is `My code`.
2. **Always-available "I got help on this one" toggle** in the result panel — off by default. When on, the submission is graded normally but does NOT count toward concept mastery (skill score gets no bump).
3. **Profile transparency**: profile page shows "X problems marked 'got help'" stat, framed as "you're being honest with the system, which makes adaptiveness sharper."

## Acceptance criteria

- [x] Paste-detect modal triggers on pastes > 20 chars OR > 30% of editor content. Single occurrence per paste, non-blocking.
- [x] "I got help" toggle in result panel; persists per-submission.
- [x] Profile field `got_help: bool` on each episode; consumed by skill-update logic.
- [x] Profile page shows "got help" stat with friendly framing.
- [x] Tutor NEVER accuses (covered by tutor pedagogy in EPIC-004 — this story does not weaken that).
- [x] Tutor reads `got_help` flag and adjusts response: "Cool — let me walk you through what this code does so you actually own the technique."

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
- 2026-05-06 — picked up
- 2026-05-06 — done. Migration 0015 + `episodes.got_help` boolean (default false). DB
  helpers: `markEpisodeGotHelp` / `getEpisodeGotHelp` / `countGotHelpEpisodes`.
  Scoring: `EpisodeSignalInput.got_help` (default false) + `updateSkillScore` returns
  prev unchanged when got_help=true (no skill bump, no attempts++, no confidence
  growth — anti-dark-pattern: never penalize, just don't reward). New
  `<PasteDetectModal>` component (role=dialog, ESC dismisses to "My code" with no
  penalty) + `usePasteDetect` hook (single-fire-per-paste invariant) + shared
  `attachPasteListener` wired into PlaygroundClient + SessionClient via Monaco
  onDidPaste + DOM-paste fallback. Per-submission "I got help on this one" toggle
  in the result-panel button row; POSTs to `/api/tutor/episodes/:id/got-help` on
  submit success. New `POST /v1/tutor/episodes/:id/got-help` Fastify route backed
  by `markEpisodeGotHelp`. `wrapWithGotHelpAwareSkillSkip` decorator wraps
  `buildUpdateProfileDrizzleDeps` so close-time `upsertSkillScore` becomes a no-op
  for got_help=true episodes (the locked `update-profile.ts` file is left
  untouched). New `assign-problem-v3` system prompt + `buildAssignProblemUserPrompt`
  with `previous_got_help` flag — when true, the tutor opens with a brief
  walk-through invitation. New `<HonestSessionsCard>` on the dashboard with
  coach-voice copy and forbidden-phrase test (no ratio surface, no "you got help"
  framing). Data export/import round-trip the `got_help` column; `DumpEnvelope`
  switched to `z.input` so older dumps (pre-column) import cleanly. ~50 new tests
  across web, prompts, db, scoring, and api packages.
