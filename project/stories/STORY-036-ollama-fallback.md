---
id: STORY-036
title: Ollama LLM adapter for privacy-conscious self-hosters
type: story
status: backlog
priority: P2
estimate: M
parent: EPIC-004
phase: v1
tags: [llm, ollama, self-host, privacy, v1]
created: 2026-04-25
updated: 2026-04-25
---

## Description

Self-hosters who care about privacy / air-gapped operation need a no-cloud-LLM option. The MVP `LLMProvider` interface stubs an Ollama adapter; v1 wires it up against a real local model and validates the loop end-to-end.

Quality will be meaningfully worse than Claude Opus. That's expected. The bet is the audience that wants this option understands the tradeoff.

## Acceptance criteria

- [ ] Ollama adapter implemented in `packages/llm/adapters/ollama.ts` against the `LLMProvider` interface.
- [ ] Documented validation against at least 2 models (e.g., `llama3.1:8b-instruct`, `qwen2.5-coder:14b-instruct`).
- [ ] Settings page "Tutor mode" toggle: Cloud (Anthropic) / Local (Ollama) / Auto-fallback (Cloud, fall back to Local on cloud failure).
- [ ] Per-mode quality benchmarks recorded — eval-harness scores ([STORY-035](STORY-035-prompt-eval-harness.md)) for each model so users can see expected quality.
- [ ] Documented in self-host setup guide: required Ollama install, model size + RAM requirements, expected latency.
- [ ] No regressions in cloud-mode behavior.

## Tasks under this Story

(To be created when this Story is picked up.)

## Dependencies

- Blocked by: EPIC-004 MVP `LLMProvider` interface (STORY-009), [STORY-035](STORY-035-prompt-eval-harness.md) (for benchmarking).

## Notes

- Reinforces [`DIFFERENTIATORS.md § 4`](../../docs/product/DIFFERENTIATORS.md) (self-hosted-first, including air-gapped).
- Tool-use quality on smaller open models is shaky — may need to scope down which agent tools are available in local mode (e.g., grading works fine, but the multi-turn tutor falls back to single-turn responses).
- Catalogued in [`docs/vision/RECOMMENDED_ADDITIONS.md`](../../docs/vision/RECOMMENDED_ADDITIONS.md).

## Activity log

- 2026-04-25 — created
