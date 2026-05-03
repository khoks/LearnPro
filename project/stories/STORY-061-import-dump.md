---
id: STORY-061
title: importDump() helper to reconstruct a user from a STORY-026 export
type: story
status: backlog
priority: P2
estimate: M
parent: EPIC-002
phase: v1
tags: [gdpr, export, privacy, saas-readiness]
created: 2026-05-03
updated: 2026-05-03
---

## Description

STORY-026 shipped the JSON export shape and the `GET /v1/export` endpoint. The shape is round-trip-importable by contract (every FK-relevant column included, ISO timestamps, jsonb passthrough), but no consumer of that shape exists yet.

This Story ships `importDump(db, dump)` — the inverse helper that takes a parsed export envelope and writes it back into a fresh instance, reconstructing the user's profile, episodes, submissions, agent_calls, and notifications. With this in place an operator can `curl /v1/export > dump.json && importDump(other_db, dump)` to migrate a self-hosted user between instances, satisfying AC #5 of STORY-026 end-to-end (export = backup) rather than just by shape.

## Acceptance criteria

- [ ] `importDump(db, dump)` in `@learnpro/db` accepts the JSON envelope `exportUserData()` produces and writes the rows back into the supplied DB.
- [ ] User is created if absent (with the email/org_id from the dump's `profile` block); profile row UPSERTed; episodes/submissions/agent_calls/notifications inserted with their original IDs preserved (or remapped if a collision exists, with a clear log line).
- [ ] FK ordering respected — episodes before submissions, problems either pre-existing or created from the dump (the export currently doesn't include problems; document the assumption).
- [ ] Idempotent — running the import twice on the same dump doesn't double-insert.
- [ ] CLI helper `pnpm --filter @learnpro/db db:import < dump.json` for the operator path.

## Dependencies

- Blocked by: STORY-026 (the export shape, satisfied 2026-05-03).

## Notes

- The export currently omits the `embedding` column on episodes (1536-dim vector that's re-derivable). Decide whether to round-trip it or recompute on import.
- Problems are not in the export envelope — the import either assumes the target instance has the same problem catalog (sane for self-hosted migrations) or a separate `db:import-problems` step from the seed bank.

## Activity log

- 2026-05-03 — created (filed during STORY-026 close-out)
