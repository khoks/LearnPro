---
id: STORY-035
title: Prompt eval harness — regression-test prompt changes on PR
type: story
status: backlog
priority: P0
estimate: M
parent: EPIC-004
phase: v1
tags: [agent, eval, ci, prompts, v1]
created: 2026-04-25
updated: 2026-04-25
---

## Description

Prompt changes today are coin flips — there's no way to know if a "small wording tweak" helps or hurts. Build a small canned-student-transcript set (~50 cases), a runner that executes prompt variants against it, and a scoring rubric. CI runs the harness on every PR that touches `packages/agent/prompts/`.

This is **the** highest-leverage tool for keeping pedagogy stable as we iterate. Without it, we're flying blind.

## Acceptance criteria

- [ ] Eval set of 50 canned student transcripts in `packages/agent/evals/transcripts/`. Each case has: user message(s), prior episode context, expected behavior tags (e.g., `should-ask-question`, `should-not-reveal-answer`, `should-reference-user-code`).
- [ ] Runner in `packages/agent/evals/runner.ts` that executes a prompt variant against all cases and scores against tags.
- [ ] Scoring uses a separate LLM-as-judge (with explicit rubric) plus deterministic checks (e.g., "did the response contain a code block when it shouldn't have?").
- [ ] GitHub Actions workflow runs the harness on PRs touching `packages/agent/prompts/`, posts a markdown summary as a PR comment with score deltas.
- [ ] Scores are stored historically so we can chart drift over time.
- [ ] Adding a new eval case takes < 10 min (template + JSON).

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
