---
id: STORY-041
title: Personal cheatsheet auto-generation per session
type: story
status: backlog
priority: P2
estimate: S
parent: EPIC-002
phase: v1
tags: [agent, ux, retention, v1]
created: 2026-04-25
updated: 2026-04-25
---

## Description

After each session, auto-generate a one-page personal cheatsheet of "things you struggled with today, summarized as flashcards." Available as in-app view + PDF export. Boosts retention via spaced re-reading and produces a tangible take-home artifact.

## Acceptance criteria

- [ ] At session-end, an LLM call generates a cheatsheet from the session's episodes (concepts touched, idioms learned, gotchas hit).
- [ ] Cheatsheet uses a fixed template: "Concept → 1-line definition → tiny code example → common gotcha." Max ~6 entries per cheatsheet.
- [ ] In-app view: tab on the session-recap screen.
- [ ] Export to PDF (single-page, printable).
- [ ] User can edit before export (Markdown-editable).
- [ ] All-time cheatsheet history available on profile page.

## Tasks under this Story

(To be created when this Story is picked up.)

## Dependencies

- Blocked by: EPIC-002 MVP session-recap UX (covered by STORY-005/STORY-006), [STORY-033](STORY-033-profile-update-agent.md) recommended (insights feed cheatsheet quality).

## Notes

- Catalogued in [`docs/vision/RECOMMENDED_ADDITIONS.md`](../../docs/vision/RECOMMENDED_ADDITIONS.md).
- Cheap (~$0.05 per session in LLM cost), high warm-fuzzy value.

## Activity log

- 2026-04-25 — created
