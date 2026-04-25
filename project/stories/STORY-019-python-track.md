---
id: STORY-019
title: Python fundamentals track
type: story
status: backlog
priority: P0
estimate: M
parent: EPIC-009
phase: mvp
tags: [track, python, content]
created: 2026-04-25
updated: 2026-04-25
---

## Description

A "track" is a curated sequence of concepts + problems that gives the learner a clear path through a topic. Python fundamentals covers: variables/types → control flow → strings → lists/tuples → dicts/sets → comprehensions → functions/closures → classes basics → file I/O → modules/packages → errors/exceptions → typing basics.

Each concept maps to 2–3 problems from the seed bank (STORY-016) and a one-paragraph "concept card" the tutor can quote when explaining.

## Acceptance criteria

- [ ] Track YAML at `packages/tracks/python-fundamentals.yaml` with ordered concept slugs.
- [ ] Each concept has a `name`, `summary`, `prerequisite_concept_slugs`, `seed_problem_ids`.
- [ ] Track loader populates the `tracks` and `concepts` tables from this YAML at boot.
- [ ] User can select this track during onboarding (STORY-005).
- [ ] Progress bar reflects concepts-mastered / total-concepts.

## Dependencies

- Blocked by: STORY-013 (concepts/tracks tables), STORY-016 (seed bank).

## Tasks

(To be created when work begins.)

## Activity log

- 2026-04-25 — created
