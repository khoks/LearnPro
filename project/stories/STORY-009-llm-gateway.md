---
id: STORY-009
title: LLMProvider interface + Anthropic adapter
type: story
status: backlog
priority: P0
estimate: M
parent: EPIC-004
phase: mvp
tags: [llm, anthropic, provider-abstraction]
created: 2026-04-25
updated: 2026-04-25
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

- [ ] `LLMProvider` interface exported from `packages/llm`.
- [ ] Anthropic adapter implements all 4 methods.
- [ ] OpenAI + Ollama adapter stubs throw `NotImplementedError`.
- [ ] Role → model mapping lives in `packages/llm/src/models.ts`.
- [ ] Integration test: a real Anthropic call returns a non-empty response.
- [ ] No code outside `packages/llm` imports the Anthropic SDK directly.

## Dependencies

- Blocked by: (none — can be built early).

## Tasks

(To be created when work begins.)

## Activity log

- 2026-04-25 — created
