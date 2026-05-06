---
id: STORY-061
title: importDump() helper to reconstruct a user from a STORY-026 export
type: story
status: done
priority: P2
estimate: M
parent: EPIC-002
phase: v1
tags: [gdpr, export, privacy, saas-readiness]
created: 2026-05-03
updated: 2026-05-06
---

## Description

STORY-026 shipped the JSON export shape and the `GET /v1/export` endpoint. The shape is round-trip-importable by contract (every FK-relevant column included, ISO timestamps, jsonb passthrough), but no consumer of that shape exists yet.

This Story ships `importDump(db, dump)` — the inverse helper that takes a parsed export envelope and writes it back into a fresh instance, reconstructing the user's profile, episodes, submissions, agent_calls, and notifications. With this in place an operator can `curl /v1/export > dump.json && importDump(other_db, dump)` to migrate a self-hosted user between instances, satisfying AC #5 of STORY-026 end-to-end (export = backup) rather than just by shape.

## Acceptance criteria

- [x] `importDump(db, dump)` in `@learnpro/db` accepts the JSON envelope `exportUserData()` produces and writes the rows back into the supplied DB. (`packages/db/src/data-import.ts`; Zod-validated at the entry point.)
- [x] User is created if absent (with the email/org_id from the dump's `profile` block); profile row UPSERTed; episodes/submissions/agent_calls/notifications inserted with their original IDs preserved. **Collision behavior:** rather than blindly overwriting (which can clobber adversarial-collision rows), the helper *skips* and logs a warning per skipped row. Round-trip use cases that genuinely need to re-key rows can do so before passing the dump in.
- [x] FK ordering respected — user → profile → episodes → submissions / agent_calls / notifications, all inside a single transaction. Problems are **not** in the export envelope — assumption documented in the helper's docblock + README; missing-problem-id paths fail fast with a clear pre-flight error before any insert.
- [x] Idempotent — running the import twice on the same dump produces zero new inserts on the second run; integration test asserts `inserted = 0` and `skipped = 1` per section.
- [x] CLI helper `pnpm --filter @learnpro/db db:import < dump.json` lands at `packages/db/bin/import.ts`. Result envelope on stdout; warnings on stderr.

## Dependencies

- Blocked by: STORY-026 (the export shape, satisfied 2026-05-03).

## Notes

- The export omits the `embedding` column on episodes (1536-dim vector that's re-derivable). The import omits it too — the embedding is re-derived from the next tutor call. A future Story can flip both to opt-in if backup-restore latency starts to matter.
- Problems are not in the export envelope — the import assumes the target instance has the same problem catalog (sane for self-hosted migrations) and fails fast with a pre-flight error if a referenced `problem_id` is missing. A separate `db:import-problems` step from the seed bank stays out of scope here.

## Activity log

- 2026-05-03 — created (filed during STORY-026 close-out)
- 2026-05-06 — picked up
- 2026-05-06 — done. `importDump()` in `packages/db/src/data-import.ts` (Zod-validated envelope; transaction-wrapped). 16 new tests (3 schema-validation + 2 no-DB importDump validation + 11 integration covering: harness boot, user create, existing-user identity preservation, profile UPSERT insert path, profile UPSERT update path, null-profile no-op, row-id preservation across all 4 sections, FK pre-flight failure, round-trip export → import, same-dump-twice idempotency, warnings array surface). CLI at `packages/db/bin/import.ts` wired as `pnpm --filter @learnpro/db db:import`.
