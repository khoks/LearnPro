---
id: STORY-005
title: Auth.js + bootstrap profile shell (conversational onboarding moved to STORY-053)
type: story
status: done
priority: P0
estimate: M
parent: EPIC-002
phase: mvp
tags: [auth, profile, nextauth]
created: 2026-04-25
updated: 2026-04-28
---

## Description

The first thing a new user sees. Auth.js (NextAuth) with **email magic link** + **GitHub OAuth** (the audience uses GitHub — making them sign in with it is signal-positive and reduces friction). After auth, **bootstrap an empty profile row** with sensible defaults so downstream agents have a row to read / write against; **then hand off to the conversational onboarding agent** ([STORY-053](./STORY-053-conversational-onboarding-agent.md)) which populates target role, time budget, languages-known, etc. through a candid chat.

This Story originally also included a 5-question structured form, but per the **Path A scope conversation (2026-04-25)** the form was replaced with the conversational onboarding agent and split into [STORY-053](./STORY-053-conversational-onboarding-agent.md). STORY-005 is now strictly **auth + profile-shell bootstrap + hand-off**.

## Acceptance criteria

- [x] Email magic link sign-in works end-to-end. NextAuth v5 Nodemailer provider in `apps/web/src/auth/auth.ts`. When `EMAIL_SERVER` is unset (self-hosted dev default), the provider uses a `jsonTransport: true` stub and logs the magic link to stdout via the `sendVerificationRequest` override — keeps dev frictionless without an SMTP server while still exercising the full Auth.js verification flow (token written to `verificationTokens`, callback URL hits `/api/auth/callback/nodemailer`, session row created on success). Production SMTP is plug-in via `EMAIL_SERVER` + `EMAIL_FROM` env vars.
- [x] GitHub OAuth sign-in works end-to-end. NextAuth v5 GitHub provider in the same `buildProviders()` helper, gated on `GITHUB_CLIENT_ID` + `GITHUB_CLIENT_SECRET` — the sign-in page (`apps/web/src/app/auth/signin/page.tsx`) hides the GitHub button when these env vars aren't set, surfaced via `isGithubAuthEnabled()`.
- [x] On first login, a `profiles` row is created with `org_id` defaulted on self-hosted and all optional fields nullable. `bootstrapProfile()` in `@learnpro/db` runs from the Auth.js `events.signIn` callback; idempotent via `INSERT ... ON CONFLICT DO NOTHING` on the `profiles.user_id` PK so re-firing is safe. Unit tests for the helper in `packages/db/src/profile-bootstrap.test.ts`.
- [x] First login routes to onboarding (STORY-053 placeholder). `destinationFor(profile)` (pure routing rule in `apps/web/src/auth/post-signin.ts`) returns `/onboarding` when the profile is missing or has `target_role === null`. The `/onboarding` page is a placeholder until STORY-053 ships the conversational agent — it shows a header, links to STORY-053, and a sign-out button. 3 unit tests for the rule in `post-signin.test.ts`.
- [x] Subsequent logins route directly to the dashboard. Same `destinationFor` rule returns `/dashboard` when `target_role` is set. The `/dashboard` page is also a placeholder for now — confirms auth + sign-out work.

### Bonus: deferred-AC mop-up enabled by this Story

- [x] **STORY-060 — `GET /llm/usage/today`** wired in `apps/api/src/index.ts`. Returns `{ used_tokens, limit_tokens, ratio }` for the authenticated user (401 when no session). Reads `DrizzleUsageStore.today(user_id)` and the configured `LEARNPRO_DAILY_TOKEN_LIMIT`. `ratio: 0` when limit is 0 (self-hosted unlimited mode) — no divide-by-zero leak. 3 endpoint tests.
- [x] **STORY-060 — friendly 429 mapping**. Fastify `setErrorHandler` catches `TokenBudgetExceededError` and maps it to `429 { error: "daily_budget_exceeded", message: "..." }` instead of letting it leak as 500. 1 endpoint test that mounts a deliberately-failing test route to exercise the global handler.
- [x] **STORY-055 — `POST /v1/interactions` `user_id` stamping**. The handler now calls `sessionResolver(req)` and stamps the resolved `user_id` (or `null` for unauthenticated requests) on every event in the batch. 1 endpoint test confirming the user_id flows through.

## Dependencies

- Blocked by: STORY-013 (learner profile schema must exist) ✅, [STORY-052](./STORY-052-monorepo-skeleton.md) (skeleton) ✅.
- Blocks: [STORY-053](./STORY-053-conversational-onboarding-agent.md) (conversational onboarding hands off from here) — now unblocked.

## Architecture notes

- **Cross-app auth split**: `apps/web` is the only Auth.js host (handlers at `/api/auth/[...nextauth]/route.ts`). `apps/api` (Fastify) doesn't run Auth.js — it validates sessions by reading the shared `sessions` table via `findSessionUser()` in `@learnpro/db`. No shared JWT secret needed for the self-hosted single-domain dev split. Production multi-domain SaaS will flip to JWT later (separate Story).
- **DB session strategy** (not JWT) so `apps/api` can revoke / introspect sessions without a shared secret.
- **Lazy adapter init**: `NextAuth` is wrapped with `() => getAuthConfig()` so config construction is deferred until first request — `next build`'s page-data collection step doesn't try to open a Postgres pool (no `DATABASE_URL` at build time).
- **Drizzle adapter tables** (`accounts`, `sessions`, `verificationTokens`) added to `packages/db/src/schema.ts` with column names matching `@auth/drizzle-adapter`'s defaults exactly. Migration `0004_auth_tables.sql` is auto-generated via `drizzle-kit generate`.
- **No direct `pg` / `drizzle-orm` deps in `apps/web`**: the Auth.js DB handle is created via `createDb()` from `@learnpro/db`; the post-signin redirect query uses `getProfileTargetRole()` helper in `@learnpro/db`. Apps depend on workspace packages, not raw drivers.

## Activity log

- 2026-04-25 — created.
- 2026-04-25 — re-scoped: structured-form onboarding split into [STORY-053](./STORY-053-conversational-onboarding-agent.md) per Path A scope confirmation. STORY-005 is now strictly auth + profile-shell bootstrap.
- 2026-04-28 — substantial WIP preserved on `origin/story/005-auth-and-profile-shell` after a parallel-agent dispatch hit a usage cap mid-work.
- 2026-04-28 — picked up the WIP branch, rebased on main (4 conflicts resolved cleanly: `next.config.ts` merged with the web build fix from chore #23; tracker housekeeping + DECISIONS_LOG took main's post-hoc-accurate version), refactored `apps/web/src/auth/{db,post-signin}.ts` to import from `@learnpro/db` instead of `pg`/`drizzle-orm` directly (option b — apps depend on workspace packages, not raw drivers; new `getProfileTargetRole` helper added to `@learnpro/db`). Added 6 endpoint tests covering the deferred ACs from STORY-060 (`GET /llm/usage/today` × 3 + 429 mapping × 1) and STORY-055 (`user_id` stamping × 1) plus an existing happy-path test. Made `NextAuth(authConfig)` lazy via the `() => config` form so the build no longer needs a `DATABASE_URL`.
- 2026-04-28 — done. All gates green: typecheck / lint / test (244 passing, 21 skipped) / format:check / `next build` (10 routes). Voice redaction AC remains deferred to STORY-056 per its own spec.
