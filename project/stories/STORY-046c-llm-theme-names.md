---
id: STORY-046c
title: LLM-generated theme names for weekly plans
type: story
status: done
priority: P2
estimate: S
parent: EPIC-006
phase: v1-followup
tags: [planning, agent, llm, ux, v1-followup]
created: 2026-05-06
updated: 2026-05-07
---

## Description

Small upgrade to [STORY-046b](STORY-046b-weekly-themed-plans.md)'s `buildWeeklyPlan` to optionally call an LLM for the theme name. The current shipped behavior uses the dominant concept's `name` as the theme (e.g. "List comprehensions week") — this Story upgrades that to an LLM-generated name that's more specific and warm (e.g. "Building blocks of declarative Python" or "Reading the room with hash maps").

The upgrade is intentionally additive: `buildWeeklyPlan` keeps the same defaults, and if no LLM-backed `themeGenerator` is wired into the deps the function falls back to the current "<concept_name> week" behavior. The route caches the generated name on the response — only one LLM call per `POST /v1/weekly-plan/replan`, never per render.

## Acceptance criteria

- [x] New versioned prompt `weekly-theme-prompt.ts` in `@learnpro/prompts` with version tag `weekly-theme-v1`.
- [x] `generateWeeklyTheme({ llm, concepts: ConceptInfo[], target_role?: string })` in `@learnpro/agent` (NEW file `weekly-theme.ts`). Returns `{ theme: string }` (≤8 words, coach-voice). Returns `null` on parse / validation failure so the caller can fall back.
- [x] `buildWeeklyPlan` accepts an optional `themeGenerator` dep — when supplied AND we have ≥3 theme concepts, await it and use the returned name. Else fall back to the dominant concept's `<name> week`.
- [x] Coach-voice forbidden-phrases test on the system prompt + a fixture-based generated-theme test.
- [x] Cost gate: `themeGenerator` runs once per `POST /v1/weekly-plan/replan` (not per render). Caching the generated theme on the response is enough for v1.
- [x] `apps/api/src/weekly-plan.ts` wires `generateWeeklyTheme` (using the same `LLMProvider` already wired in `defaultsFromEnv`) to the deps adapter. Operator-disable env flag: `LEARNPRO_WEEKLY_THEME_LLM=0` switches the behavior off.

## Deferred / explicitly-skipped

- Persistent caching of generated themes across replans (v1 uses request-time generation only — re-plan calls one LLM call, normal GET reads use the existing cached `weekly_plan_marker_at` shape and don't add an LLM call).
- Multi-language theme names (the prompt is English-only for v1).

## Dependencies

- Builds on: [STORY-046b](STORY-046b-weekly-themed-plans.md) — the `buildWeeklyPlan` composer + the `/v1/weekly-plan` routes.
- Builds on: [STORY-009](STORY-009-llm-gateway.md) — the `LLMProvider` interface.

## Notes

- The themeGenerator is async; `buildWeeklyPlan` becomes async unconditionally so the API surface stays consistent regardless of whether the generator is wired. The pure-fallback path is still synchronous in spirit (no `await`) — the function just lifts to a Promise so the caller has one shape to wire.
- Forbidden-phrase tests reuse the patterns from STORY-039's `problem-variants` prompt (no FOMO, no streak language, no fire emoji 🔥, no warning emoji ⚠️, no "level up", etc.).

## Activity log

- 2026-05-06 — created and picked up. Deferred follow-up from STORY-046b's "LLM-generated theme names" item.
- 2026-05-07 — done. New `weekly-theme-v1` prompt in `@learnpro/prompts` (warm coach-voice; explicit "no exclamation / no fire emoji / no streak / no motivational filler" rules + good vs. avoid examples). New pure agent `generateWeeklyTheme` in `@learnpro/agent` (Haiku call; ≤8 words / ≤80 chars; coach-voice forbidden-substring rejector + exclamation + all-caps-imperative rejector; null on any parse / validation failure → caller falls back). `buildWeeklyPlan` is now async and accepts an optional `themeGenerator` dep — when supplied AND ≥ MIN_CONCEPTS_FOR_LLM_THEME (3) concepts picked, awaits it and uses the returned name. Else falls back to STORY-046b's deterministic "<concept_name> week". Empty-graph branch + < 3 concepts branch never call the generator. `apps/api/src/weekly-plan.ts` wires the generator on the replan path only (cost gate: GETs never fire it). New `LEARNPRO_WEEKLY_THEME_LLM` env flag (default on; `0` / `false` / `off` disable). ~70 new tests (16 prompt + 35 agent + 10 buildWeeklyPlan integration + 10 API wiring). All 379 agent + 338 api tests pass.
