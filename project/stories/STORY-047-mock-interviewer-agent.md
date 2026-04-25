---
id: STORY-047
title: Mock interviewer agent persona (timed problems, neutral tone, debrief)
type: story
status: backlog
priority: P1
estimate: L
parent: EPIC-004
phase: v2
tags: [agent, interview, persona, monetization, v2]
created: 2026-04-25
updated: 2026-04-25
---

## Description

A **separate "interviewer" agent persona** distinct from the tutor: timed problems, neutral demeanor, no hints, post-interview debrief covering technical performance, communication, and "what you'd want to say differently in a real interview."

This is a major willingness-to-pay signal for the SaaS phase — interview prep is a $500+ product category (cf. interviewing.io, Pramp, Exponent).

## Acceptance criteria

- [ ] New agent persona with distinct system prompt, distinct tone (cool, neutral, "I'm here to evaluate, not to teach").
- [ ] Mock-interview mode in UI: "Start a mock interview" button on dashboard, runs a 30/45/60-min session.
- [ ] Per-mode behavior: timer visible, hints disabled, problems pulled from interview-tagged subset of bank.
- [ ] User is encouraged to "talk through your approach" — agent listens (or reads, if voice not yet available) and asks clarifying questions like a real interviewer.
- [ ] Post-interview debrief generated: technical correctness, time management, communication clarity, recommended follow-ups.
- [ ] Debrief is saved to profile as a special episode type; doesn't pollute regular skill scores.

## Tasks under this Story

(To be created when this Story is picked up.)

## Dependencies

- Blocked by: EPIC-004 MVP tutor (STORY-011), [STORY-035](STORY-035-prompt-eval-harness.md) (need eval harness for the new persona).
- Synergistic with: voice tutor (EPIC-008) — interviews are way better with voice.

## Notes

- Per [`COMPETITIVE.md`](../../docs/product/COMPETITIVE.md): no platform that *teaches* you also *interviews* you well — and that's a big LearnPro wedge.
- Could spin out as new EPIC-018 if scope grows beyond a single persona (e.g., role-specific interviewers — backend, frontend, ML).
- Catalogued in [`docs/vision/RECOMMENDED_ADDITIONS.md`](../../docs/vision/RECOMMENDED_ADDITIONS.md).

## Activity log

- 2026-04-25 — created
