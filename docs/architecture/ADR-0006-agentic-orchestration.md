# ADR-0006 — Single-agent harness with workflow-routed model selection via skill/policy docs

- **Status:** Proposed (2026-04-25) — pending owner review.
- **Deciders:** Rahul (project owner)
- **Phase:** MVP
- **Related:** [ADR-0003 — LLM provider](./ADR-0003-llm-provider.md), [`docs/decisions/DECISIONS_LOG.md`](../decisions/DECISIONS_LOG.md) (2026-04-25 Path A), [`docs/vision/NOVEL_IDEAS.md`](../vision/NOVEL_IDEAS.md) (2026-04-25 single-agent entry), [STORY-057](../../project/stories/STORY-057-policy-adapter-interfaces.md), [STORY-052](../../project/stories/STORY-052-monorepo-skeleton.md).

## Context

LearnPro runs a lot of distinct LLM-driven workflows: conversational onboarding, problem assignment, hint generation (3 rungs), grading, autonomy decisions, profile update, session planning, "why am I stuck" reflection, and (later) mock interviewing. Each workflow has different cost/latency budgets, different tool needs, and different prompt graphs.

Three viable shapes for the agent layer:

| Shape | What it is | Why we'd pick it | Why we wouldn't |
|---|---|---|---|
| **Multi-agent crew** | Distinct named agents (TutorAgent, GraderAgent, PlannerAgent…) each with its own loop, state, and inter-agent messaging | Clean conceptual separation; mirrors microservice instinct | Inter-agent protocol overhead; debugging spans N transcripts; shared state needs a coordination layer; doesn't actually buy isolation since they all hit the same DB |
| **Single monolithic agent** | One prompt + one tool kit, branched in-prompt by `if user_state == "onboarding"…` | Simplest possible implementation | Prompt becomes unwieldy at ~5+ workflows; can't tier model selection (every call pays Opus prices); evaluation is impossible because every prompt change is a regression risk for every workflow |
| **Single-agent harness, workflow-routed** *(this ADR)* | One agentic loop. A router inspects the active workflow id, loads that workflow's skill/policy doc, and from the doc picks model tier + tool set + prompt graph for the next turn | One transcript per session (debuggable); model tiers per workflow (cost-efficient); each workflow is independently editable and evaluable; matches the [Claude Agent SDK](https://docs.claude.com/en/docs/agent-sdk/overview) pattern, which is what we use anyway | More indirection than a monolith; needs a registry + policy-doc convention to work |

Two adjacent constraints that pushed the choice:

- **Path A** ([`DECISIONS_LOG.md`](../decisions/DECISIONS_LOG.md)) ships deterministic policy adapters in MVP and GenAI swap-ins in v1. The policy-adapter pattern needs an orchestrator that *consults* the policies — it doesn't make sense to give each policy its own agent loop.
- **Cost telemetry** is per-call ([ADR-0003](./ADR-0003-llm-provider.md)). If we pick model tier per workflow at the policy-doc level, we get cleanly-attributed cost per workflow without instrumenting agent code.

## Decision

LearnPro uses a **single-agent harness** with **workflow-routed model selection** declared in **per-workflow skill/policy docs**.

### Components

```
packages/agent/
  orchestrator.ts            // the one agent loop
  workflow-registry.ts       // workflow_id -> policy doc path
  workflows/
    onboarding/POLICY.md     // declarative: model, tools, prompt graph, hand-off rules
    onboarding/prompts/*.md
    onboarding/handlers/*.ts // tool implementations specific to this workflow
    hint-generation/POLICY.md
    hint-generation/prompts/*.md
    hint-generation/handlers/*.ts
    grading/POLICY.md
    ...
```

Per-turn flow:

1. `orchestrator.run(session, workflow_id)` is the only entry point.
2. Router resolves `workflow_id` → loads `workflows/<name>/POLICY.md`.
3. Policy doc declares (front-matter):
   - `model_tier: opus | haiku` (resolved against [ADR-0003](./ADR-0003-llm-provider.md)'s `LLMProvider`)
   - `allowed_tools: [...]` (subset of the global tool registry)
   - `prompt_graph: <name>` (e.g., `socratic-question-then-reveal`, `score-and-explain`, `confirm-or-act-by-band`)
   - `policy_adapters: [scoring, tone, difficulty, autonomy]` ([STORY-057](../../project/stories/STORY-057-policy-adapter-interfaces.md))
   - `cost_budget_tokens: <n>` (per-turn cap; over-budget triggers degradation)
   - `handoff_rules: [...]` (when to switch workflows mid-session, e.g., onboarding → first session plan)
4. The orchestrator runs the standard tool-use loop with the resolved configuration.
5. Each call emits `cost_telemetry(workflow_id, model, tokens, latency, …)` and a `policy_decision` event into [STORY-055](../../project/stories/STORY-055-rich-interaction-telemetry-schema.md)'s `interactions` table.

### Skill/policy doc convention

A `POLICY.md` is **declarative, not code**. It looks like:

```markdown
---
workflow_id: hint-generation
model_tier: opus              # rung 1/2 are cheap; rung 3 reveals the technique
allowed_tools:
  - read_problem_context
  - read_user_recent_attempts
  - emit_hint
prompt_graph: socratic-question-then-reveal
policy_adapters: [tone, autonomy]
cost_budget_tokens: 2000
handoff_rules:
  - if: user_clicks_submit
    to: grading
---

## Pedagogical intent
(Free-form prose: what this workflow is *for*, the rules tutor must obey,
example good/bad responses. Read by the LLM at runtime as system context.)
```

The doc is loaded once per turn, hashed, and the hash recorded in telemetry so prompt changes are traceable. Editing a workflow's behavior is editing one file; no orchestrator code changes.

### Why this works for us specifically

- **One harness, many workflows** keeps the agent loop bug-free (the loop is the same for every workflow; only configuration changes).
- **Policy docs are the spec.** Pedagogy lives in markdown that a non-engineer can read and edit. The "what should the tutor do here" question has a single answer location per workflow.
- **Cost tier per workflow** drops grading / routing onto Haiku, keeps tutor / interviewer on Opus. Aggregate cost is bounded by the policy docs, not by agent-implementation accidents.
- **Telemetry attribution is free.** `workflow_id` is the foreign key into cost reports and into [STORY-055](../../project/stories/STORY-055-rich-interaction-telemetry-schema.md)'s interaction stream.
- **Path-A policy adapters slot in cleanly.** A workflow's `policy_adapters` list is a DI binding; deterministic in MVP, GenAI in v1, no orchestrator change.

## Consequences

**Positive:**
- Single transcript per session — debuggable, replayable, exportable.
- Model-tier-per-workflow gives natural cost control without per-call routing logic in agent code.
- Pedagogy edits don't touch TS code; lower risk of regressions in unrelated workflows.
- Adding a workflow is "create a folder, write a POLICY.md, register it" — no harness refactor.

**Negative:**
- The router + policy-doc loader is non-trivial scaffolding (estimated within [STORY-057](../../project/stories/STORY-057-policy-adapter-interfaces.md) / a follow-on Story). Cost is paid in MVP; payoff compounds as workflow count grows.
- Policy docs are a new artifact type. Discipline required to keep them as the spec rather than drift into stale prose. Mitigation: the doc hash in telemetry catches divergence; the prompt eval harness (v1, [STORY-035](../../project/stories/STORY-035-prompt-eval-harness.md)) regression-tests against them.
- Less "agent-y" than a multi-agent crew. We give up the marketing optics of "TutorAgent talks to GraderAgent" — internally, it's all one loop. Honest is better than fashionable.

**Neutral:**
- This pattern is essentially what the [Claude Agent SDK](https://docs.claude.com/en/docs/agent-sdk/overview) already encodes (skills + tool registries + workflow routing). We are not inventing the architecture — we are *naming our use of it* so the codebase stays coherent. The plausibly-novel piece (per [`NOVEL_IDEAS.md`](../vision/NOVEL_IDEAS.md)) is the *pedagogy-specific policies* (rung-laddered hints, anti-praise grading, interaction-aware profile updates), not the orchestration shape.

## Open questions (deliberately out-of-scope for this ADR)

- **Streaming vs. blocking per workflow.** Tutor / hint workflows want streaming for UX; grading does not. Will be set per-workflow in `POLICY.md` once the orchestrator is implemented.
- **Cross-workflow memory.** Conversation history within a session is shared; how much to persist across sessions is a [STORY-056](../../project/stories/STORY-056-data-retention-and-redaction.md) and EPIC-014 (RAG) concern, not an orchestration concern.
- **Concurrent workflows.** Two workflows on the same session at once (e.g., background profile-update while tutor is active). Phase: v1+; out of scope for MVP.

## Alternatives considered (already in the table above; restated for completeness)

- **Multi-agent crew (TutorAgent / GraderAgent / PlannerAgent etc.).** Rejected: shared-DB-but-separate-loops creates coordination overhead and N-transcript debugging burden without buying isolation we actually need.
- **Single monolithic agent with branching prompt.** Rejected: doesn't tier model cost, doesn't allow per-workflow evaluation, and the prompt becomes unmaintainable past ~5 workflows.

---

This ADR records the architecture. The first concrete realization (workflow registry + policy-doc loader + one example workflow end-to-end) lands as part of [STORY-057](../../project/stories/STORY-057-policy-adapter-interfaces.md) or a follow-on Story under EPIC-019.
