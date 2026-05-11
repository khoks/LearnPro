---
id: STORY-039e
title: Admin failed-gate surface for LLM-generated problem variants
type: story
status: done
priority: P2
estimate: M
parent: STORY-039
phase: v1
tags: [problems, llm, admin, operator, v1-followup]
created: 2026-05-11
updated: 2026-05-11
---

## Description

STORY-039 deferred AC #6 (admin tool to inspect failed-gate variants) — when a variant fails the
structural Zod gate, the identity checks, the self-validation gate (STORY-039a), or the
spec-clarity judge (STORY-039d), the agent currently drops it silently and returns empty. An
operator has no surface to see WHICH variants failed, WHY, or how often.

This Story adds a persistent failure log + a minimal read-only admin Fastify endpoint + a minimal
admin Next.js page so the operator can see what's failing without scraping app logs.

## Acceptance criteria

- [x] New `variant_gate_failures` table (migration 0025) keyed by `source_problem_id` with
      `failure_reason` (one of parse_error / identity_mismatch / spec_clarity_judge / self_validation
      / retry_exhausted), `failure_detail jsonb`, `model_id text`, `attempt_number int`,
      `attempted_at timestamptz`. Index on `(source_problem_id, attempted_at desc)`.
- [x] `users.is_admin boolean default false` column (migration 0026) — the admin route checks this.
- [x] `generateProblemVariant` extended with optional `failureLogger?: (entry) => Promise<void>`
      parameter. When provided, called on every failed attempt with the structured failure entry.
      Existing callers without `failureLogger` keep working (no-op default).
- [x] Fastify route inserts failures into the new table via a `DrizzleVariantFailureLogger`
      (fire-and-forget — async insert errors logged but never block the user response).
- [x] New `GET /v1/admin/variant-failures` route — paginated (default 50, max 200), filterable by
      `source_problem_id`, auth-gated + admin-only (401 if no session, 403 if not admin). Returns
      `{ failures: [{ source_problem_slug, failure_reason, failure_detail, model_id,
      attempt_number, attempted_at }], total }`. Read-only — never mutates.
- [x] New Next.js page at `/admin/variant-failures` (server component) — renders a table with
      source problem | failure reason | failure detail | model | attempt | when. Non-admins
      redirect to `/dashboard`. Empty state handled.
- [x] Tests pass: DB schema test asserts insert/query; agent test asserts `failureLogger` is called
      on each failure path; admin route tests cover 401/403/200/filter/pagination; web page tests
      cover non-admin redirect + admin sees table + empty state.

## Tasks under this Story

(Inlined into the activity log — no separate TASK files needed for an M-sized follow-up.)

## Dependencies

- Blocked by: [STORY-039](STORY-039-llm-problem-variants.md) (provides the agent + route + cache).
- Reuses: existing `requireAuth` middleware pattern from the other admin routes.

## Notes

- Operator manually flips a user's `is_admin = true` via psql. No UI for that in v1 (matches the
  "no SaaS plumbing in MVP" rule — this is operator-only).
- Strictly read-only surface — never offers retry / delete / publish actions on failed variants.
  That would be a separate Story if/when needed.
- The route + page deliberately don't expose org_id filtering — variant failures are global
  (variants are content, not user data, per the STORY-039 design note).

## Activity log

- 2026-05-11 — created
- 2026-05-11 — picked up
- 2026-05-11 — done. New `variant_gate_failures` table (migration 0025) — CHECK-constrained `failure_reason` (5 reasons: parse_error / identity_mismatch / spec_clarity_judge / self_validation / retry_exhausted), `failure_detail jsonb`, `model_id`, `attempt_number`, indexed on `(source_problem_id, attempted_at desc)`. New `users.is_admin boolean default false` (migration 0026). `generateProblemVariant` accepts an optional `failureLogger` callback; on every failed attempt the agent emits a discriminated `VariantFailureEntry` (parse_error vs identity_mismatch differentiated by the new `parseProblemVariantResponseDetailed` helper). The Fastify route in apps/api wires `buildDrizzleVariantFailureLogger` so failures persist; insert errors are logged + swallowed so the user response never blocks. New auth+admin-gated `GET /v1/admin/variant-failures` Fastify route returns paginated failures (default 50, max 200) with joined `source_problem_slug`. New Next.js admin page at `/admin/variant-failures` (server component) renders a minimal table — Source | Reason | Detail (JSON) | Model | Attempt | When. Non-admins redirect to /dashboard via apps/api's 403. ~30 new tests across DB helpers (8) + agent (12) + route (9) + UI (16).
