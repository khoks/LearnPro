---
id: STORY-035
title: Prompt eval harness — regression-test prompt changes on PR
type: story
status: done
priority: P0
estimate: M
parent: EPIC-004
phase: v1
tags: [agent, eval, ci, prompts, v1]
created: 2026-04-25
updated: 2026-05-01
---

## Description

Prompt changes today are coin flips — there's no way to know if a "small wording tweak" helps or hurts. Build a small canned-student-transcript set (~50 cases), a runner that executes prompt variants against it, and a scoring rubric. CI runs the harness on every PR that touches `packages/agent/prompts/`.

This is **the** highest-leverage tool for keeping pedagogy stable as we iterate. Without it, we're flying blind.

## Acceptance criteria

- [x] Eval set of 50 canned student transcripts in `packages/agent/evals/transcripts/`. Each case has: user message(s), prior episode context, expected behavior tags (e.g., `should-ask-question`, `should-not-reveal-answer`, `should-reference-user-code`). Distribution: 15 hint + 15 grade + 10 onboarding + 10 session-plan.
- [x] Runner in `packages/agent/evals/runner.ts` that executes a prompt variant against all cases and scores against tags. `runEvals()` wraps an `LLMProvider`, builds the right system prompt per category from `@learnpro/prompts`, and aggregates per-case + per-category + per-tag results into a Zod-validated `EvalReport` (`packages/agent/evals/types.ts`).
- [x] Scoring uses a separate LLM-as-judge (with explicit rubric) plus deterministic checks. Layer 1: explicit-failure regex sweep (with PCRE-style `(?i)` flag translation) + JSON-shape gate per category. Layer 2: per-tag Haiku judge call returning `{ passed, reasoning }`. Judge is skipped when Layer 1 already failed (cost saver).
- [x] GitHub Actions workflow runs the harness on PRs touching `packages/prompts/src/**` or `packages/agent/evals/**`, posts a markdown summary as a PR comment with score deltas vs. main's most-recent committed report. `.github/workflows/prompt-eval.yml`.
- [x] Scores are stored historically so we can chart drift over time. JSON reports committed under `packages/agent/evals/reports/` keyed by `EVAL_REPORT_VERSION` for stable schema across drift.
- [x] Adding a new eval case takes < 10 min (template + JSON). Author one JSON file in `packages/agent/evals/transcripts/`, run typecheck — `EvalCaseSchema` validates at the boundary.

## Tasks under this Story

(To be created when this Story is picked up.)

## Dependencies

- Blocks: [STORY-034](STORY-034-critique-agent-split.md) (need this to validate the split is actually better).
- Blocks: any major tutor prompt change in v1+.

## Notes

- Promptfoo is a candidate off-the-shelf option; consider it before hand-rolling. Trade-off: a hand-rolled harness gives full control over the rubric but costs 2x the time.
- Cost: every PR run costs ~$0.50–$2 in LLM tokens. Acceptable.
- Catalogued in [`docs/vision/RECOMMENDED_ADDITIONS.md`](../../docs/vision/RECOMMENDED_ADDITIONS.md).

## Activity log

- 2026-04-25 — created
- 2026-05-01 — picked up
- 2026-05-01 — done. 50 transcripts, two-layer runner (deterministic + Haiku judge), `pnpm --filter @learnpro/agent eval` CLI with `--filter` / `--baseline` / `--markdown-out`, prompt-eval CI workflow on PRs touching prompts or evals (posts a markdown PR comment, fails on regressions vs. main's baseline). 25 new tests on the harness itself (loader + runner). Cost envelope ~$0.50–$2 per full run per spec. ANTHROPIC_API_KEY documented in CLAUDE.md.
