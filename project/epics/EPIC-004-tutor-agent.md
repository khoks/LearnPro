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

## Design notes & alternatives

**This Epic owns the most important UX in the product.** The tutor *is* the differentiator. See [`docs/product/UX_DETAILS.md § EPIC-004`](../../docs/product/UX_DETAILS.md#epic-004--tutor-agent-harness-the-pedagogy) for the full pedagogy spec — read it before writing tutor prompts.

Key locked decisions for this Epic (all are non-negotiable; violating them collapses LearnPro into "ChatGPT with extra steps"):

- **Question-first, reveal-on-second-ask.** Tutor asks a Socratic question targeting the gap; only reveals the technique on a second hint click or third stuck signal.
- **Tutor must reference the user's actual code in the first response after submit.** Generic praise is forbidden. Enforced by prompt + post-processing check.
- **No surprise help.** Tutor never volunteers a hint. User must click `Hint` (which has an XP cost: 5/15/30 per rung).
- **No autocomplete / no Copilot-style ghost text.** Deliberate anti-Copilot stance — autocomplete steals the productive struggle. See [`DIFFERENTIATORS.md § 5`](../../docs/product/DIFFERENTIATORS.md).
- **Cheating is never accused.** Soft signals (`paste_ratio`, time-on-problem) are logged silently. Optional "I got help on this one" toggle excludes the episode from mastery weighting.
- **Tone: direct + warm, no exclamation marks, no emoji, no "you got this!"** See the tone calibration table in UX_DETAILS for specific scripts (good vs. bad responses) for: easy solve, stuck user, wrong submit, correct-but-inefficient code, "this is too hard," "just give me the answer."
- **Tutor panel hard-caps at 4 visible messages** before requiring "expand history." Long scrollback distracts from the editor.

The tutor identity, the question-vs-reveal heuristic, the frustration handler, and the cheating philosophy are all spelled out in UX_DETAILS — those are the spec.

## Activity log

- 2026-04-25 — created
