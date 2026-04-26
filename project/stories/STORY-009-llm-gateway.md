---
id: STORY-009
title: LLMProvider interface + Anthropic adapter
type: story
status: done
priority: P0
estimate: M
parent: EPIC-004
phase: mvp
tags: [llm, anthropic, provider-abstraction]
created: 2026-04-25
updated: 2026-04-26
done: 2026-04-26
---

## Description

Per [ADR-0003](../../docs/architecture/ADR-0003-llm-provider.md), all LLM calls go through a single `LLMProvider` interface in `packages/llm`. MVP ships **one** impl: Anthropic. OpenAI and Ollama adapters are stubbed (signature-only, throw on call) so future swaps are mechanical.

Interface methods:
- `complete({ messages, model, max_tokens, temperature, system, tools })` — non-streaming.
- `stream({ messages, ... })` — token-by-token via async iterator.
- `embed({ text, model })` — for the pgvector schema (retrieval comes in v1).
- `tool_call({ messages, tools, tool_choice })` — model-controlled tool invocation.

Calls are routed by **role**, not by hardcoded model name: `tutor` → Opus, `grader` → Haiku, `router` → Haiku. Model-name strings live in a versioned config so swapping is a one-line change.

## Acceptance criteria

- [x] `LLMProvider` interface exported from `packages/llm`.
- [x] Anthropic adapter implements all 4 methods (`embed` throws `NotImplementedError` deliberately — embedding service is deferred per ADR-0003).
- [x] OpenAI + Ollama adapter stubs throw `NotImplementedError`.
- [x] Role → model mapping lives in `packages/llm/src/models.ts`.
- [x] Integration test: a real Anthropic call returns a non-empty response (gated on `ANTHROPIC_API_KEY`; skipped in CI by default).
- [x] No code outside `packages/llm` imports the Anthropic SDK directly (the `@anthropic-ai/sdk` import lives only in `anthropic-sdk-transport.ts`).

## Dependencies

- Blocked by: (none — can be built early).

## Tasks

(To be created when work begins.)

## Activity log

- 2026-04-25 — created
- 2026-04-26 — picked up; designing `LLMProvider` interface + Anthropic adapter + role→model mapping + telemetry hook + provider registry. OpenAI/Ollama as stubs.
- 2026-04-26 — done (PR #9). 4-method LLMProvider + AnthropicProvider (injectable transport) + OpenAI/Ollama stubs + role→model routing + telemetry hook + retry-with-backoff + `LEARNPRO_LLM_CONFIG` env-driven config + DI wired into `apps/api` + `/llm` smoke endpoint. 32 unit tests + 1 gated integration test. `embed()` deferred per ADR-0003.
