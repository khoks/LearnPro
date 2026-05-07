---
id: STORY-036
title: Ollama LLM adapter for privacy-conscious self-hosters
type: story
status: done
priority: P2
estimate: M
parent: EPIC-004
phase: v1
tags: [llm, ollama, self-host, privacy, v1]
created: 2026-04-25
updated: 2026-05-06
---

## Description

Self-hosters who care about privacy / air-gapped operation need a no-cloud-LLM option. The MVP `LLMProvider` interface stubs an Ollama adapter; v1 wires it up against a real local model and validates the loop end-to-end.

Quality will be meaningfully worse than Claude Opus. That's expected. The bet is the audience that wants this option understands the tradeoff.

## Acceptance criteria

- [x] Ollama adapter implemented in `packages/llm/adapters/ollama.ts` against the `LLMProvider` interface.
- [ ] Documented validation against at least 2 models (e.g., `llama3.1:8b-instruct`, `qwen2.5-coder:14b-instruct`). **Deferred — manual operator step.** See "Deferred validation" in `docs/operations/SELF_HOST_OLLAMA.md`. The agent worktree can't pull 8GB+ models.
- [x] Settings page "Tutor mode" toggle: Cloud (Anthropic) / Local (Ollama) / Auto-fallback (Cloud, fall back to Local on cloud failure).
- [ ] Per-mode quality benchmarks recorded — eval-harness scores ([STORY-035](STORY-035-prompt-eval-harness.md)) for each model so users can see expected quality. **Deferred — manual operator step.** Same reason as AC #2.
- [x] Documented in self-host setup guide: required Ollama install, model size + RAM requirements, expected latency.
- [x] No regressions in cloud-mode behavior. — `LLMRouter.cloud` mode test asserts cloud-only delegation; full apps/api + apps/web suites still green (251 + 495 passing).

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
- 2026-05-06 — picked up; scaffolded the adapter + LLMRouter + tutor_mode toggle + self-host docs.
- 2026-05-06 — done (scaffold complete; AC #2 + AC #4 deferred to manual operator validation, captured in `docs/operations/SELF_HOST_OLLAMA.md` § Deferred validation). Landed:
  - `packages/llm/src/adapters/ollama.ts` — `OllamaTransport` (complete / stream / embed / toolCall) hitting `/api/chat` + Zod-validated responses + zero-cost telemetry tagged `pricing_version='local'`.
  - `packages/llm/src/llm-router.ts` — `LLMRouter` decorator routes per-request via `getMode(req)` callback; cloud / local / auto-fallback semantics + sync-throw stream fallback.
  - `packages/db/migrations/0016_llm_mode.sql` + `packages/db/src/llm-mode.ts` — adds `profiles.tutor_mode` column with CHECK constraint + `getTutorMode` / `updateTutorMode` helpers.
  - `apps/api/src/llm-mode.ts` — `GET / PUT /v1/settings/llm-mode` Fastify routes; `defaultsFromEnv()` wraps the cloud LLM in an `LLMRouter` driven by `getTutorMode(db, user_id)`.
  - `apps/web/src/components/settings/TutorModeCard.tsx` + `apps/web/src/app/settings/llm/page.tsx` + `apps/web/src/app/api/settings/llm-mode/route.ts` — three-radio settings UI with coach-voice copy + Ollama-target visibility for local/auto-fallback + Next.js proxy.
  - `docs/operations/SELF_HOST_OLLAMA.md` — install + pull + configure + benchmark guide; explicit "Deferred validation" section captures AC #2 + AC #4 reproduction steps.
  - **Tests:** 18 OllamaTransport + 9 LLMRouter + 6 llm-mode API + 7 TutorModeCard + 3 TutorModeSchema = **43 new tests**. Full apps/api + apps/web suites green.
