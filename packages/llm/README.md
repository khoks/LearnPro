# @learnpro/llm

Single gateway for every LLM call in LearnPro. Implements [ADR-0003](../../docs/architecture/ADR-0003-llm-provider.md).

## What this package owns

- The `LLMProvider` interface (`complete`, `stream`, `embed`, `toolCall`).
- Provider adapters: `AnthropicProvider` (MVP impl), `OpenAIProvider` + `OllamaProvider` (stubs that throw `NotImplementedError`).
- Role -> model mapping (`tutor`/`interviewer`/`reflection` -> Opus, `grader`/`router` -> Haiku).
- Cross-cutting concerns: retry-with-backoff on transient errors, telemetry hook on every call.
- A registry (`buildLLMProvider`) that's config-driven via `LEARNPRO_LLM_CONFIG` env var.

## What this package does NOT own

- The Anthropic SDK is imported only inside `anthropic-sdk-transport.ts`. Application code never imports `@anthropic-ai/sdk` directly; if you need provider-specific behavior, extend the `AnthropicTransport` interface or add a method to the gateway.
- Embeddings: `embed()` throws `NotImplementedError` until the embedding service lands (TBD per ADR-0003 / ADR-0004). The interface and pgvector schema still reserve space.
- Per-user daily token budget enforcement and the prompt registry are tracked separately (STORY-012, future Stories) but plug into the same telemetry hook this package emits.

## Default role -> model map

| Role          | Default model               | Rationale                                                       |
| ------------- | --------------------------- | --------------------------------------------------------------- |
| `tutor`       | `claude-opus-4-7`           | Highest-quality teaching, hint generation, grading explanations |
| `interviewer` | `claude-opus-4-7`           | Mock-interview persona needs depth                              |
| `reflection`  | `claude-opus-4-7`           | Self-reflection / debrief responses                             |
| `grader`      | `claude-haiku-4-5-20251001` | High volume, structured output                                  |
| `router`      | `claude-haiku-4-5-20251001` | Fast intent classification                                      |

Override either field per-process via `LEARNPRO_LLM_CONFIG`:

```bash
export LEARNPRO_LLM_CONFIG='{"provider":"anthropic","models":{"tutor":"claude-opus-4-7-preview"}}'
```

## Telemetry

Every `complete` / `stream` / `toolCall` invocation calls `LLMTelemetrySink.record(event)` with `{ provider, model, role?, prompt_version?, user_id?, task, input_tokens, output_tokens, latency_ms, ok, decided_at }`. Default sink is `NullLLMTelemetrySink`. The `apps/api` layer can swap in a sink that writes to the `interactions` table once STORY-055 lands.

## Tests

- Unit tests use a `FakeTransport` and never touch the network.
- `anthropic.integration.test.ts` is gated on `ANTHROPIC_API_KEY` and is skipped in CI by default.
