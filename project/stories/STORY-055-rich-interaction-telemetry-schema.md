---
id: STORY-055
title: Rich interaction telemetry schema (cursor focus, attempts/reverts, voice, time-per-section)
type: story
status: backlog
priority: P0
estimate: M
parent: EPIC-005
phase: mvp
tags: [profile, telemetry, schema, novel]
created: 2026-04-25
updated: 2026-04-25
---

## Description

Capture *how* the user is thinking, not just *what* they submitted. Schema and capture pipeline for:

- **Cursor focus events**: which file / which function / which line range the cursor sits in, and for how long.
- **Voice transcript** (text-only in MVP via browser SpeechRecognition, when user opts in): what the user said while their cursor was on a particular section.
- **Attempts and reverts**: every time the user changes a chunk of code and then reverts it (within a configurable time window).
- **Time-per-section**: derived from cursor focus events; aggregated per function / per problem.

Implements **Q2G** from the MVP scope discussion. NOVEL_IDEAS candidate (#6 in the 2026-04-25 batch).

## Scope

- Schema in `packages/db`:
  - `interactions` table: `(id, episode_id, user_id, type, payload jsonb, t timestamp)` where `type ∈ { cursor_focus, voice, edit, revert, run, submit, hint_request, hint_received, autonomy_decision }`.
  - `episodes` table extended with `interactions_summary: jsonb` denormalized aggregate (fast tutor-time read; raw events stay in `interactions`).
- Client capture (in `apps/web`):
  - Cursor focus tracker (Monaco `onCursorPositionChanged` + debouncer).
  - Edit / revert detector (diff against last 30 s snapshot).
  - Voice opt-in toggle in Settings (default off).
- API ingestion endpoint: batched `POST /v1/interactions` with Zod validation.
- Privacy:
  - Voice is opt-in only.
  - Voice transcripts redacted of detected names / emails / urls before persistence (depends on [STORY-056](./STORY-056-data-retention-and-redaction.md)).
  - User can wipe their interaction history from the data-export page (depends on STORY-026).

## Out of scope

- Keystroke-level capture (too noisy; explicitly rejected as "hyperbolic" in the Q&A).
- Tutor *consumption* of the telemetry — that's tutor-agent work; this Story just produces the data.
- Replay UI — separate Story under EPIC-002 in v1.

## Acceptance criteria

- [ ] `interactions` table created with the schema above; migration runs cleanly.
- [ ] Client capture working for cursor focus + edits + reverts; voice gated behind opt-in.
- [ ] Batched POST endpoint validated and persisting events.
- [ ] Smoke test: simulate a 5-minute coding session; verify expected event counts in DB.
- [ ] Voice fields redacted via [STORY-056](./STORY-056-data-retention-and-redaction.md) before persistence.
- [ ] No measurable performance regression on the editor (< 5 ms p50 added latency per cursor move).

## Dependencies

- Blocked by: [STORY-052](./STORY-052-monorepo-skeleton.md), STORY-013 (profile / episode schema), [STORY-056](./STORY-056-data-retention-and-redaction.md) (redaction pipeline for voice).
- Blocks: [STORY-054](./STORY-054-adaptive-autonomy-controller.md) (autonomy needs this for engagement signal); the v1 GenAI scoring / difficulty implementations (they need this telemetry).

## Notes

- Honest prior-art check: Replit / collaborative IDEs log keystrokes; some research IDEs (codex.io) capture this for analysis. But "tutor uses real-time interaction telemetry as live signal during tutoring" is the novel angle. Worth flagging in [`NOVEL_IDEAS.md`](../../docs/vision/NOVEL_IDEAS.md).
- This Story is **MVP-critical even though the consumers are v1+** — capturing rich data from user 1 means the v1 personalization layer has data to learn from immediately rather than starting cold.

## Activity log

- 2026-04-25 — created (Path A scope confirmation)
