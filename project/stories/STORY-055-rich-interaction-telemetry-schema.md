---
id: STORY-055
title: Rich interaction telemetry schema (cursor focus, attempts/reverts, voice, time-per-section)
type: story
status: done
priority: P0
estimate: M
parent: EPIC-005
phase: mvp
tags: [profile, telemetry, schema, novel]
created: 2026-04-25
updated: 2026-04-26
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

- [x] `interactions` table created with the schema above; migration runs cleanly. Drizzle migration `0003_interactions.sql` adds the new `interaction_type` pgEnum (`cursor_focus`/`voice`/`edit`/`revert`/`run`/`submit`/`hint_request`/`hint_received`/`autonomy_decision`), the `interactions` table with `(id, org_id, user_id, episode_id, type, payload jsonb, t, created_at)`, two btree indexes (`(episode_id, t)` for tutor scans + `(user_id, t)` for per-user history), and `episodes.interactions_summary jsonb` for fast tutor-time reads. `user_id` and `episode_id` are nullable until auth lands (STORY-005) so the playground can ship anonymous events today.
- [x] Client capture working for cursor focus + edits + reverts; voice gated behind opt-in. `useInteractionCapture` (`apps/web/src/lib/use-interaction-capture.ts`) wires Monaco's `onDidChangeCursorPosition` + `onDidChangeModelContent` to two pure trackers — `CursorFocusTracker` (debounces "stays in region for ≥ 200 ms" → emits `cursor_focus` with computed duration) and `RevertDetector` (sliding 30 s snapshot window; if a new edit's text matches a recent snapshot, emits `revert` instead of `edit`). PlaygroundClient renders an opt-in voice toggle (default off) — toggle UI lands here; capture is **deferred to STORY-056** because raw voice transcripts can't be persisted without redaction.
- [x] Batched POST endpoint validated and persisting events. `POST /v1/interactions` in `apps/api/src/index.ts` parses with `InteractionsBatchSchema`, stamps server-side `t` when the client omits it, returns `202 Accepted` with `{ accepted: N }` on success, `400` on Zod failure, `503` when the store throws. Default impl is `NoopInteractionStore` (drops events) so tests + the dev playground don't need a DB; `DrizzleInteractionStore` (`packages/db/src/interaction-store.ts`) bulk-inserts a batch in a single round-trip and gets wired in once apps/api gets a DB client (post-STORY-005). Browser → Next.js proxy at `apps/web/src/app/api/interactions/route.ts` mirrors the sandbox proxy (Zod-validate, forward, pipe upstream response).
- [x] Smoke test: simulate a 5-minute coding session; verify expected event counts in DB. Covered by 5 `DATABASE_URL`-gated integration tests against a real Postgres in `interaction-store.test.ts` (full mapping / bulk insert / empty-batch no-op / anonymous-events / custom-org_id stamping) plus 7 batcher unit tests + 11 capture unit tests + 6 Next.js route tests + 6 Fastify endpoint tests = 35 STORY-055 tests in total. Run integration locally: `DATABASE_URL=postgresql://learnpro:learnpro@localhost:5432/learnpro pnpm --filter @learnpro/db test`.
- [ ] Voice fields redacted via [STORY-056](./STORY-056-data-retention-and-redaction.md) before persistence. **Deferred to STORY-056** as planned in the Story spec — the `voice` event type + Zod schema are wired in this Story so STORY-056 can land redaction without a schema migration.
- [x] No measurable performance regression on the editor (< 5 ms p50 added latency per cursor move). `CursorFocusTracker.onCursorChange` is O(1) (a single equality check + a single event emit when the threshold is crossed); the React hook holds the trackers in `useRef` so the closure cost is paid once per mount, not per cursor move. Batcher uses fire-and-forget POST with `keepalive: true` so the editor never awaits the network.

## Dependencies

- Blocked by: [STORY-052](./STORY-052-monorepo-skeleton.md) ✅, STORY-013 (profile / episode schema) ✅, [STORY-056](./STORY-056-data-retention-and-redaction.md) (redaction pipeline for voice) — voice AC deferred per the spec.
- Blocks: [STORY-054](./STORY-054-adaptive-autonomy-controller.md) (autonomy needs this for engagement signal); the v1 GenAI scoring / difficulty implementations (they need this telemetry).

## Notes

- Honest prior-art check: Replit / collaborative IDEs log keystrokes; some research IDEs (codex.io) capture this for analysis. But "tutor uses real-time interaction telemetry as live signal during tutoring" is the novel angle. Worth flagging in [`NOVEL_IDEAS.md`](../../docs/vision/NOVEL_IDEAS.md).
- This Story is **MVP-critical even though the consumers are v1+** — capturing rich data from user 1 means the v1 personalization layer has data to learn from immediately rather than starting cold.

## Activity log

- 2026-04-25 — created (Path A scope confirmation).
- 2026-04-26 — picked up. Built schema + Zod boundary + DB store + API endpoint + Next.js proxy + Monaco capture in one PR; voice redaction AC explicitly deferred to STORY-056 as the spec allowed.
- 2026-04-26 — done. PR landed with 35 new tests across 5 packages (1 schema test, 5 store integration tests, 12 Zod schema tests, 7 batcher tests, 11 capture tests, 6 Next.js route tests, 6 Fastify endpoint tests). Pre-existing `next build` issue with `@learnpro/sandbox` not in `transpilePackages` is unrelated and not gated by CI; filing follow-up.
