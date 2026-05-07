# Self-hosting LearnPro with Ollama (local LLM)

> Status: scaffold landed via [STORY-036](../../project/stories/STORY-036-ollama-fallback.md). Functional validation against real Ollama models is a manual operator step (deferred from the story — see "Deferred validation" below).

LearnPro defaults to Anthropic Claude in the cloud. Self-hosters who care about privacy or air-gapped operation can flip the per-user **Tutor mode** toggle to **Local (Ollama)** or **Auto-fallback** at `/settings/llm`. Local mode keeps every prompt + completion on your hardware.

The `OllamaTransport` adapter (in `packages/llm/src/adapters/ollama.ts`) implements the same `LLMProvider` interface as the Anthropic adapter, so every downstream caller — tutor, hint ladder, grader, session-plan agent — works in either mode.

## What you need

| Component | Minimum | Recommended |
|---|---|---|
| Ollama install | [Latest stable](https://ollama.com/download) | Latest stable |
| Disk | 6 GB (one 8B model) | 12 GB (two models) |
| RAM | 12 GB system, 8 GB free | 24 GB system, 16 GB free |
| GPU | None — CPU works | NVIDIA / Apple Silicon for >2× throughput |
| Network | None at runtime | None at runtime |

Quality on local 8–14B models is meaningfully lower than Claude Opus. The audience for this option understands the tradeoff. If you depend on tool-use quality (multi-turn tutor flows), use **Auto-fallback** so the cloud handles the hard turns and Ollama covers the rest.

## Install Ollama

```bash
# macOS / Linux
curl -fsSL https://ollama.com/install.sh | sh

# Windows: download the installer from https://ollama.com/download
```

Verify it's running:

```bash
curl http://localhost:11434/api/version
# {"version":"x.y.z"}
```

## Pull the recommended models

LearnPro's default is `llama3.1:8b-instruct` (small, fast, decent instruction following). For coding tasks specifically, `qwen2.5-coder:14b-instruct` does better at tool-use JSON envelopes:

```bash
ollama pull llama3.1:8b-instruct        # ~4.7 GB
ollama pull qwen2.5-coder:14b-instruct  # ~9 GB
```

Each pull takes 5–15 minutes on a typical broadband connection.

## Point LearnPro at Ollama

Set these environment variables on the LearnPro **API server** before boot:

```bash
# Optional — defaults are sane for a same-host install.
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1:8b-instruct
```

If your Ollama instance is on a different host:

```bash
OLLAMA_BASE_URL=http://192.168.1.42:11434
OLLAMA_MODEL=qwen2.5-coder:14b-instruct
```

The API server reads these at boot. The values are surfaced (read-only) in the `/settings/llm` page so the user can confirm where local-mode requests will route.

## Flip the toggle

Sign in and visit `/settings/llm`. Pick:

- **Cloud (Anthropic Claude)** — default. Your prompts go to Anthropic.
- **Local (Ollama)** — requests route to your `OLLAMA_BASE_URL`. Cloud is bypassed entirely.
- **Auto-fallback** — try cloud first; on cloud failure (offline, budget exceeded, transient error), retry against Ollama for the rest of that request.

The choice is per-user, persisted on the `profiles.tutor_mode` column (migration `0016_llm_mode.sql`).

## Expected latency

Approximate first-token latency on commodity hardware. Throughput after the first token is usually 20–50 tok/s on CPU, 80–200 tok/s on GPU.

| Model | M2 Pro CPU | RTX 4070 | Server CPU (16 cores) |
|---|---|---|---|
| `llama3.1:8b-instruct` | 1.5–3 s | 0.4–0.8 s | 2–4 s |
| `qwen2.5-coder:14b-instruct` | 3–6 s | 0.7–1.3 s | 5–10 s |

For comparison: cloud Anthropic Claude is ~0.6–1.5 s first-token. Local mode on CPU feels like a slower tutor — fine for hint surfacing, slow for streaming explanations.

## Embeddings: skipped in local mode

Ollama exposes `/api/embeddings` but only for models with an embedding head. To stay portable across the user's installed model set, the LearnPro local adapter returns an empty embedding vector by design. Features that depend on embeddings (concept-similarity ranking) gracefully degrade — they fall back to the heuristic policy from `@learnpro/scoring` so the loop still works. If you need real embeddings in local mode, switch the toggle to **Auto-fallback** and let the cloud handle that one call.

## Tool-use: best-effort JSON envelope

Smaller open-weight models can't reliably emit Anthropic-style structured tool calls. The local adapter prompts the model to respond with a JSON envelope of the form:

```json
{ "tool": "give-hint", "input": { "rung": 2 } }
```

If the response parses + the tool name is in the allowed set, the adapter synthesises a `ToolInvocation`. If parsing fails, the adapter returns the raw text with `tool_calls: []` and the tutor's autonomy controller falls through to the next safest action. This means:

- Single-turn tasks (give-hint with a rung, grade with a verdict) work reasonably well.
- Multi-turn tutor flows (assign-problem → mid-session feedback → update-profile) may degrade — the adapter can only express one tool call per response, and the model may not always pick the right one.
- For coding tasks specifically, prefer `qwen2.5-coder:14b-instruct` over generic instruction-tuned models — its JSON output is markedly more reliable.

## Benchmarking with the eval harness

The [STORY-035 prompt-eval harness](../../project/stories/STORY-035-prompt-eval-harness.md) can run the canned student transcripts against a local model. Once Ollama is running and the model is pulled:

```bash
LLM_MODE=local OLLAMA_MODEL=llama3.1:8b-instruct pnpm eval --markdown-out=eval-llama.md
LLM_MODE=local OLLAMA_MODEL=qwen2.5-coder:14b-instruct pnpm eval --markdown-out=eval-qwen.md
```

Compare the two markdown reports against the cloud baseline (`pnpm eval`) to see the per-mode quality delta. AC #4 of STORY-036 — "Per-mode quality benchmarks" — is satisfied by committing one report per recommended model under `docs/operations/eval-reports/`.

## Deferred validation (manual operator steps)

The agent worktree that scaffolded STORY-036 doesn't have Ollama installed (the models are 8 GB+, the worktree is ephemeral, and pulling them isn't appropriate for an automated agent). Two acceptance criteria remain manual:

- **AC #2 — validation against ≥2 models.** Reproduce by:
  1. Following the install + pull steps above on a self-host machine.
  2. Setting `OLLAMA_MODEL` and the LearnPro `tutor_mode` to `local`.
  3. Running through one full tutor session per model: assign-problem → submit failing → request hint → submit passing → close. Confirm the tutor responds for every step.
  4. Verifying telemetry rows land in `agent_calls` with `provider='ollama'` + `cost_usd=0` + `pricing_version='local'`.

- **AC #4 — per-mode quality benchmarks via the eval harness.** Reproduce by running the `pnpm eval` commands above and committing the markdown reports under `docs/operations/eval-reports/llama3.1-8b.md` + `docs/operations/eval-reports/qwen2.5-coder-14b.md`. Diff against the cloud baseline.

When these have run successfully, tick AC #2 + AC #4 in the [story file](../../project/stories/STORY-036-ollama-fallback.md) and add a "deferred validation passed YYYY-MM-DD" line to the activity log.

## Troubleshooting

- **`Ollama HTTP 404` from the adapter** — the model isn't pulled. Run `ollama list` and pull what you need.
- **`ECONNREFUSED`** — Ollama isn't running, or `OLLAMA_BASE_URL` points at the wrong host. Test with `curl ${OLLAMA_BASE_URL}/api/version`.
- **Tool calls always come back as `tool_calls: []`** — the model is too small / not instruction-tuned for JSON output. Switch to `qwen2.5-coder:14b-instruct` or use **Auto-fallback** so the cloud handles tool calls.
- **First request is very slow, subsequent requests fast** — Ollama lazy-loads models on first use. Pre-warm with `curl ${OLLAMA_BASE_URL}/api/chat -d '{"model":"...","messages":[{"role":"user","content":"hi"}]}'`.
