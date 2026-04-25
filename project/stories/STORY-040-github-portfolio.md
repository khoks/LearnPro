---
id: STORY-040
title: GitHub portfolio integration — auto-push completed projects
type: story
status: backlog
priority: P1
estimate: M
parent: EPIC-013
phase: v1
tags: [integration, github, portfolio, v1]
created: 2026-04-25
updated: 2026-04-25
---

## Description

After a user completes a multi-session project (see [STORY-048](STORY-048-project-based-learning.md)) — or, in v1, after they reach a per-track milestone — auto-create a `learnpro-portfolio` repo on their GitHub account and push the code with a generated README.

Sticky (the work lives outside our app), shareable (recruiters can see it), retention-positive (they look at us less often, but more meaningfully — they come back to ship the next thing).

## Acceptance criteria

- [ ] GitHub OAuth app set up with `repo` scope (separate scope grant from auth-only).
- [ ] User opt-in flow in settings ("Connect GitHub portfolio"). One-time, revocable.
- [ ] On milestone completion, a single click ("Save to portfolio") creates a directory in the user's `learnpro-portfolio` repo (auto-created if missing) with: code, README explaining what was built, link back to the LearnPro problem (optional, off by default).
- [ ] README is generated from a template; user can edit before publishing.
- [ ] Per-user toggle for "auto-push without confirming" once they've done it once.
- [ ] No dependency on LearnPro at runtime — the portfolio repo is self-contained code the user owns.

## Tasks under this Story

(To be created when this Story is picked up.)

## Dependencies

- Blocked by: EPIC-002 GitHub OAuth (STORY-005 — auth-only scope), [STORY-048](STORY-048-project-based-learning.md) recommended (so there are real projects to push).

## Notes

- This is a v1 idea even without project-based learning: a user can push individual completed problems too. But the value really lands with multi-session projects.
- Reinforces [`DIFFERENTIATORS.md § 2`](../../docs/product/DIFFERENTIATORS.md) (the user owns their data — even the artifacts of their work).
- Catalogued in [`docs/vision/RECOMMENDED_ADDITIONS.md`](../../docs/vision/RECOMMENDED_ADDITIONS.md).

## Activity log

- 2026-04-25 — created
