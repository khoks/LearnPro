---
id: STORY-040
title: GitHub portfolio integration — auto-push completed projects
type: story
status: done
priority: P1
estimate: M
parent: EPIC-013
phase: v1
tags: [integration, github, portfolio, v1]
created: 2026-04-25
updated: 2026-05-01
---

## Description

After a user completes a multi-session project (see [STORY-048](STORY-048-project-based-learning.md)) — or, in v1, after they reach a per-track milestone — auto-create a `learnpro-portfolio` repo on their GitHub account and push the code with a generated README.

Sticky (the work lives outside our app), shareable (recruiters can see it), retention-positive (they look at us less often, but more meaningfully — they come back to ship the next thing).

## Acceptance criteria

- [x] GitHub OAuth app set up with `repo` scope (separate scope grant from auth-only). Lives at `/api/portfolio/oauth/{start,callback}` in apps/web; HMAC-signed state token + HttpOnly cookie + scope verification on callback. Auth-only `github` provider stays untouched.
- [x] User opt-in flow in settings ("Connect GitHub portfolio"). One-time, revocable. `/settings/portfolio` page renders `<PortfolioCard>`; Disconnect button drops the `accounts` row keyed `(provider="github-portfolio", providerAccountId=login)`.
- [x] On milestone completion, a single click ("Save to portfolio") creates a directory in the user's portfolio repo (auto-created if missing) with: code, README, link back to the LearnPro problem (optional, off by default). `<SaveToPortfolioButton>` on /session opens a modal; POST /v1/portfolio/push runs `ensureRepoExists` then 2 × `pushFile`.
- [x] README is generated from a template; user can edit before publishing. `generateReadme()` in @learnpro/portfolio produces the template; the modal exposes a textarea so the user can override it before posting.
- [x] Per-user toggle for "auto-push without confirming" once they've done it once. `profiles.github_auto_push_enabled` (default false); flipped via PUT /v1/portfolio/settings; surfaced in PortfolioCard.
- [x] No dependency on LearnPro at runtime — the portfolio repo is self-contained code the user owns. Templates produce a self-contained README + solution file; back-link footer is opt-in (default off).

## Tasks under this Story

Implemented as a single coherent PR rather than split tasks — the layers are tightly coupled (schema → portfolio package → OAuth → API → UI) and breaking them apart would have meant six PRs to land one user-visible feature.

## Dependencies

- Blocked by: EPIC-002 GitHub OAuth (STORY-005 — auth-only scope), [STORY-048](STORY-048-project-based-learning.md) recommended (so there are real projects to push).

## Notes

- This is a v1 idea even without project-based learning: a user can push individual completed problems too. But the value really lands with multi-session projects.
- Reinforces [`DIFFERENTIATORS.md § 2`](../../docs/product/DIFFERENTIATORS.md) (the user owns their data — even the artifacts of their work).
- Catalogued in [`docs/vision/RECOMMENDED_ADDITIONS.md`](../../docs/vision/RECOMMENDED_ADDITIONS.md).
- The OAuth callback persists `providerAccountId = login` (GitHub username), distinct from NextAuth's auth-only `github` provider which stores the numeric id. Different provider value, different conventions, no PK conflict.
- `@octokit/rest` was rejected in favor of a hand-rolled fetch client — only two endpoints are used (PUT contents + POST /user/repos), and Octokit pulls in ~25 transitive deps for auth/retries/pagination we don't need.

## Activity log

- 2026-04-25 — created
- 2026-05-01 — picked up + implemented end-to-end (schema migration 0012, @learnpro/portfolio package, /api/portfolio/oauth/{start,callback} flow, 5 routes in apps/api/src/portfolio.ts, PortfolioCard + SaveToPortfolioButton + 5 Next.js proxies)
- 2026-05-01 — done (107 tests added across 4 packages; full monorepo build green)
