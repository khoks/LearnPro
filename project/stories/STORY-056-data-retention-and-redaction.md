---
id: STORY-056
title: Data retention & redaction pipeline (raw transcripts + episodic summaries)
type: story
status: backlog
priority: P0
estimate: M
parent: EPIC-016
phase: mvp
tags: [security, privacy, retention, redaction, gdpr]
created: 2026-04-25
updated: 2026-04-25
---

## Description

The user committed to keeping **both raw and episodic memories** (Q1F): raw LLM prompts / responses + voice transcripts, alongside the rolled-up episode summaries. That decision raises the privacy-blast-radius enough that we need a real retention + redaction policy *before* we start storing rich transcripts at scale.

## Scope

- **Retention policy** (configurable per-tenant; sensible defaults):
  - Raw LLM prompts / responses: **90 days**, then auto-summarized + raw deleted.
  - Voice transcripts: **30 days**, then auto-summarized + raw deleted.
  - Episode summaries: **indefinite** (until user requests deletion).
  - Interaction telemetry (cursor focus, edits): **90 days**, then aggregated + raw deleted.
- **Redaction pipeline** (runs at ingestion, before persistence):
  - PII detection: emails, phone numbers, URLs, credit-card-like numbers, government-ID patterns.
  - Implementation: regex-based first pass + LLM-assisted second pass (Haiku) for borderline cases.
  - Redacted fields tagged in metadata so the user can see what was scrubbed.
- **User-facing data controls** (extends STORY-026):
  - "Show what we have on you" view.
  - "Delete my voice transcripts" button.
  - "Delete everything and close my account" flow.
- **Background job** (BullMQ on Redis): nightly retention sweep that enforces the retention windows.

## Out of scope

- Compliance certification (SOC 2 / HIPAA) — separate v3 work.
- DSAR (Data Subject Access Request) automation beyond the data-export endpoint already in STORY-026.
- E2E encryption of stored data — encryption at rest is handled at the volume level, not per-row.

## Acceptance criteria

- [ ] Retention policy documented in `docs/security/RETENTION.md` (new file).
- [ ] Redaction pipeline running at all relevant ingestion points (LLM responses, voice transcripts).
- [ ] PII detection unit tests cover the 5 pattern categories above.
- [ ] Nightly retention job sweeps and deletes per policy; smoke-tested against seeded data.
- [ ] User-facing "show what we have" + "delete voice" + "delete account" flows working.
- [ ] No raw transcript stored without first passing through redaction (verified via integration test that bypasses the client and posts directly to the ingestion endpoint).

## Dependencies

- Blocked by: [STORY-052](./STORY-052-monorepo-skeleton.md), STORY-013 (schema), [STORY-055](./STORY-055-rich-interaction-telemetry-schema.md) (telemetry to retain), STORY-026 (data-export endpoint to extend).
- Blocks: any v1 work that depends on having durable raw transcripts.

## Notes

- Retention windows above are starting points; values may evolve. They live in config so they can be tuned without redeploy.
- Voice opt-in ([STORY-055](./STORY-055-rich-interaction-telemetry-schema.md)) plus voice-30-day-retention (this Story) is the dual-gate: even users who opt in to voice get short retention by default.

## Activity log

- 2026-04-25 — created (Path A scope confirmation)
