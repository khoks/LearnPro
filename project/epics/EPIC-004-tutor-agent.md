---
id: EPIC-004
title: Tutor agent harness (LLM gateway + agents)
type: epic
status: backlog
priority: P0
phase: mvp
tags: [agent, llm, anthropic, prompts]
created: 2026-04-25
updated: 2026-04-25
---

## Goal

Provide the LLM-powered tutor that drives the adaptive loop: assigns problems, gives hints, grades open-ended work, and writes back to the learner profile. Wrap all LLM calls behind a `LLMProvider` interface so we can swap providers (Anthropic primary; OpenAI and Ollama stubbed) without touching agent business logic.

## Scope

**MVP:**
- `LLMProvider` interface in `packages/llm` with `complete`, `stream`, `embed`, `tool_call` methods.
- Anthropic adapter implemented (Opus for tutor, Haiku for grading/routing).
- OpenAI and Ollama adapters stubbed with `NotImplementedError`.
- Tutor agent (Claude Opus) with tools: `assignProblem`, `giveHint(rung: 1|2|3)`, `grade`, `updateProfile`.
- Versioned prompt registry under `packages/agent/prompts/`.
- Cost telemetry on every call (provider, model, tokens, latency, user-id, prompt-version).
- Per-user daily token budget with graceful degradation.

**v1+:**
- Critique / grader agent split from tutor (reduces "nice tutor" bias).
- Profile-update agent (async post-session writeback).
- "Why am I stuck?" reflection agent.
- Prompt eval harness (Promptfoo or hand-rolled) on PRs.
- Local model fallback (Ollama).

**v2+:**
- Mock interviewer agent persona.
- Frustration / confusion detection feeding agent behavior.

## Out of scope

- Multi-provider routing logic in MVP (single provider, abstraction is sufficient).
- Fine-tuning custom models.
- Voice TTS/STT (lives under EPIC-008).

## Stories under this Epic

- STORY-011 — Implement `LLMProvider` interface + Anthropic adapter (MVP)
- STORY-012 — Build tutor agent with 4 tools (MVP)
- STORY-013 — Set up prompt registry + cost telemetry (MVP)

## Exit criteria (MVP)

- [ ] Tutor agent can assign, hint, and grade for both Python and TypeScript problems without breaking.
- [ ] All 3 hint rungs work and feel meaningfully different.
- [ ] Per-call cost telemetry visible at `/admin/telemetry`.
- [ ] Daily budget cap enforces gracefully (no 500s; user sees a clear "you've reached today's limit" message).
- [ ] Adding the OpenAI adapter would require zero changes outside `packages/llm`.

## Related

- ADR: [`ADR-0003-llm-provider`](../../docs/architecture/ADR-0003-llm-provider.md)
- Vision: [`docs/vision/GROOMED_FEATURES.md`](../../docs/vision/GROOMED_FEATURES.md) § Theme 2

## Activity log

- 2026-04-25 — created
