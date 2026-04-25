# ADR-0003 — LLM provider: Anthropic primary, behind `LLMProvider` interface

- **Status:** Accepted (2026-04-25)
- **Deciders:** Rahul (project owner)
- **Phase:** MVP

## Context

The tutor agent, grader agent, hint generator, profile-update agent, and (in v1+) reflection / interviewer agents all depend on an LLM. The choice of provider has cost, latency, capability, and lock-in implications. The user explicitly wants:

- An LLM-backed agentic harness on top of a third-party model.
- Custom database, RAG, memory store *owned by us* — only the inference is third-party.
- Long-term flexibility (e.g., privacy-sensitive deployments using local models).

Constraints:

- Strong **tool-use / function-calling** is required (every agent uses tools).
- **Reliable instruction following** matters more than raw frontier intelligence — we are running structured workflows.
- **Cost control** is critical (agentic loops can burn tokens fast).
- We want to be able to **swap providers** without rewriting agent code.

Options considered:

| Provider | Strengths | Weaknesses |
|---|---|---|
| **Anthropic Claude** | Excellent tool use; reliable instruction following; strong system-prompt adherence; tutor/grader split easy via persona prompts | One vendor |
| OpenAI | Largest ecosystem; gpt-4o-mini extremely cheap for high-volume grading; broad tooling | History of API behavior shifts |
| Both, day-1 multi-provider router | Per-route best model | ~3–5 days extra MVP scope; flexibility we may not yet need |
| Local models (Ollama / llama.cpp) | Zero per-call cost; full privacy | Quality gap on tool use; ops burden |

## Decision

For MVP: **Anthropic Claude** is the primary provider.

- **Tutor / interviewer / reflection agents:** Claude Opus 4.x.
- **Grader / routing / classification:** Claude Haiku 4.x (cheaper, fast).
- **Embeddings:** TBD per [ADR-0004](./ADR-0004-database.md) — likely a separate embedding service called from the LLM gateway.

All calls go through an **`LLMProvider` interface** in `packages/llm` with methods:

```ts
interface LLMProvider {
  complete(req: CompleteRequest): Promise<CompleteResponse>;
  stream(req: CompleteRequest): AsyncIterable<StreamChunk>;
  embed(req: EmbedRequest): Promise<EmbedResponse>;
  toolCall(req: ToolCallRequest): Promise<ToolCallResponse>;
}
```

Adapters:

- `AnthropicProvider` — implemented for MVP.
- `OpenAIProvider` — interface stubbed; thrown `NotImplementedError` until needed.
- `OllamaProvider` — interface stubbed; for v2 privacy-mode option.

Cross-cutting features the gateway provides regardless of adapter:

- **Per-user daily token budget** with graceful degradation messages.
- **Cost telemetry on every call** (provider, model, prompt-version, task type, tokens-in, tokens-out, latency, user-id).
- **Retry with exponential backoff** on transient errors.
- **Versioned prompt registry** (`packages/agent/prompts/`).
- **Prompt eval harness** (Promptfoo or hand-rolled) running on PRs that touch a prompt.

## Consequences

**Positive:**
- Single provider keeps MVP cost model and ops surface simple.
- The interface guarantees we can swap to OpenAI or Ollama later without touching agent business logic.
- Tutor/grader split exploits the Opus / Haiku tier difference — high quality where it matters, low cost for routine routing.

**Negative:**
- Vendor concentration risk. Mitigation: the interface and the stubbed adapters mean migration is bounded work (days, not weeks).
- Anthropic API changes would require an adapter update; framework-agnostic prompts help.

**Neutral:**
- Picking OpenAI as primary instead would not be wrong — it's a reversible choice. We pick Anthropic because the user's existing tooling (Claude Code) and the model's tool-use reliability tilt the balance.
