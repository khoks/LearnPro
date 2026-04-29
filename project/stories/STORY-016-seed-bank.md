---
id: STORY-016
title: Curated seed problem bank (~30 Python + ~30 TS) with hidden tests
type: story
status: backlog
priority: P0
estimate: L
parent: EPIC-007
phase: mvp
tags: [problems, content, hidden-tests]
created: 2026-04-25
updated: 2026-04-25
---

## Description

LLM-generated problems are unreliable for MVP — they hallucinate edge cases and contradictory test expectations. We hand-curate (or carefully cite from open sources like LeetCode-style sets we have rights to) **~30 Python + ~30 TS** problems spanning beginner → intermediate, each with:

- Title, prompt, starter code stub, language, concept tags, difficulty (1–5).
- Public examples (shown in the editor).
- **Hidden test cases** (used by the grader; never shown to the user).
- Reference solution (used by the grader to compare approach quality, not just correctness).
- Expected median time-to-solve (used by the difficulty tuner).

LLM-generated **variants** of these seeds come in v1 once the eval harness can validate them.

## Acceptance criteria

- [ ] 30 Python problems exist as YAML/JSON files in `packages/problems/python/`.
- [ ] 30 TS problems exist similarly.
- [ ] Each problem validated against its reference solution (all hidden tests pass).
- [ ] Concept tags use the slug format defined in STORY-013.
- [ ] Difficulty distribution: ~10 at L1–2, ~15 at L3, ~5 at L4–5.

## Dependencies

- Blocked by: STORY-013 (concepts table needs to exist for tagging).

## Tasks

(To be created when work begins.)

## Activity log

- 2026-04-25 — created.
- 2026-04-28 — partial attempt via parallel-agent dispatch (alongside STORY-005 + STORY-010). Agent stopped mid-work due to usage cap. Salvaged WIP preserved on `origin/story/016-seed-problem-bank` (commit message starts `wip(problems): ...`). Shipped on that branch: full `packages/problems/` scaffold (Zod `ProblemDefSchema` with kebab-case slug + concept-tag enforcement, YAML loader with language-dir validation, `validateProblems` runner with Python + TS sandbox harnesses that emit `__LEARNPRO_PASS__` / `__LEARNPRO_FAIL__` verdict tokens), and 33 Python YAMLs covering variables / control flow / strings / lists / dicts / classes / errors / etc. **Still TODO:** ~30 TypeScript YAMLs, the test suite (schema parse / distribution / slug uniqueness / loader idempotency / reference-solution validation), `pnpm install` to materialize `js-yaml`. Resume from the WIP branch — do NOT restart.
