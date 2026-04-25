---
id: STORY-012
title: Per-call LLM cost & latency telemetry + per-user daily token budget
type: story
status: backlog
priority: P0
estimate: S
parent: EPIC-004
phase: mvp
tags: [llm, telemetry, cost-control]
created: 2026-04-25
updated: 2026-04-25
---

## Description

Every LLM call is logged with: `user_id`, `org_id`, `role` (tutor/grader/router), `model`, `prompt_tokens`, `completion_tokens`, `cost_usd`, `latency_ms`, `cached_tokens`, `tool_used`, `session_id`. This is the data that lets us answer "what does a typical learning session cost?" before scale becomes a surprise bill.

Layered on top: a per-user **daily token budget** (configurable, default 100k tokens). When 80% consumed, the tutor agent silently downgrades Opus → Sonnet → Haiku. At 100%, it serves a friendly "you've used your daily AI budget — try again tomorrow or upgrade" message. Self-hosted defaults to "no limit" but the plumbing is there for SaaS.

Goes through the `Telemetry` adapter from EPIC-015 (console impl in MVP, OpenTelemetry later).

## Acceptance criteria

- [ ] `agent_calls` table records all 10 fields above.
- [ ] Daily token budget is enforced server-side (not just UI).
- [ ] Graceful model-downgrade kicks in at 80% consumption.
- [ ] At 100%, user sees a friendly message, not an error stack trace.
- [ ] Cost calculation uses a versioned price table per model (so price changes don't silently break analytics).

## Dependencies

- Blocked by: STORY-009 (LLM gateway).

## Tasks

(To be created when work begins.)

## Activity log

- 2026-04-25 — created
