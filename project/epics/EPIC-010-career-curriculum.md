---
id: EPIC-010
title: Career-aware curriculum (role library, recommendations)
type: epic
status: backlog
priority: P1
phase: mvp
tags: [onboarding, career, recommendations]
created: 2026-04-25
updated: 2026-04-25
---

## Goal

Make LearnPro's recommendations career-relevant: ask the user about their target role, recommend the 2 languages to master and 1 to operate in, and weight the curriculum accordingly. This is what makes "personalized" feel real.

## Scope

**MVP:**
- Onboarding interview (5 questions): target role, languages known, weekly time budget, learning goal, current self-assessed level.
- Role library (Backend Java, Frontend React, Full-stack TS, ML Engineer, …) — hand-curated initially.
- Recommended language stack output (2 to master, 1 to operate in) shown after onboarding.

**v2+:**
- Job-description parser (paste a JD → gap analysis).
- Resume / portfolio gap report.

**v3+:**
- Salary / role-trend integration.

## Out of scope

- Mentor matching (deliberately de-prioritized — see [recommended additions](../../docs/vision/RECOMMENDED_ADDITIONS.md)).
- Job board integration.

## Stories under this Epic

- STORY-021 — Role library + recommended language stack output (MVP)

(STORY-005 — Onboarding questionnaire — lives under EPIC-002 since it's the entry point of the MVP loop, but contributes here.)

## Exit criteria (MVP)

- [ ] Onboarding completes in under 2 minutes.
- [ ] Recommended stack reflects the user's stated role and time budget.
- [ ] Re-running onboarding (settings) updates recommendations.

## Related

- Vision: [`docs/vision/GROOMED_FEATURES.md`](../../docs/vision/GROOMED_FEATURES.md) § Theme 7

## Activity log

- 2026-04-25 — created
