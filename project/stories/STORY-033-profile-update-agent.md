---
id: STORY-033
title: Async profile-update agent for higher-level trait synthesis
type: story
status: backlog
priority: P1
estimate: M
parent: EPIC-004
phase: v1
tags: [agent, profile, async, v1]
created: 2026-04-25
updated: 2026-04-25
---

## Description

In MVP, the tutor agent updates the profile inline (during the user-facing session). This adds latency and limits the depth of analysis (the inline tutor is busy talking to the user; it can't also do deep cross-episode pattern synthesis).

Split out an **async profile-update agent** that runs after each session. It reads the day's episodes and synthesizes higher-level traits — e.g., "user struggles with mutability boundaries — same root cause shows up in 4 different problem types this week." Writes those summaries back to the profile as durable insights.

## Acceptance criteria

- [ ] Profile-update agent runs as a BullMQ job triggered at session-end.
- [ ] Reads the session's episodes + the user's last 30 days of relevant episodes.
- [ ] Generates 1–3 cross-episode insights per session, stored in a new `profile_insights` table.
- [ ] Insights are surfaced to the tutor at next-session start (so the tutor can reference them: "I noticed yesterday you kept reaching for `for` when comprehensions would be cleaner — let's keep an eye on that today").
- [ ] Telemetry on agent latency, cost, and how often insights are referenced by the tutor.

## Tasks under this Story

(To be created when this Story is picked up.)

## Dependencies

- Blocked by: EPIC-004 MVP tutor agent (STORY-011).
- Pairs with: [STORY-034](STORY-034-critique-agent-split.md) (related agent split).

## Notes

- This is the "two-agent pattern": main tutor is fast/responsive; side agent is slow/thoughtful. Well-established in agent design.
- Use Haiku for cost-efficiency — this agent doesn't need Opus latency.
- Catalogued in [`docs/vision/RECOMMENDED_ADDITIONS.md`](../../docs/vision/RECOMMENDED_ADDITIONS.md).

## Activity log

- 2026-04-25 — created
