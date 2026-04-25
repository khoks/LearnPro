---
id: EPIC-014
title: RAG / agent memory (lessons + user code + docs)
type: epic
status: backlog
priority: P2
phase: v1
tags: [rag, embeddings, pgvector, memory]
created: 2026-04-25
updated: 2026-04-25
---

## Goal

Ground tutor responses in real content (lesson material, the user's own past code, official documentation) instead of relying on the LLM's parametric knowledge. This is what shifts LearnPro from "chatbot tutor" to "tutor that knows your history and the truth."

## Scope

**MVP:**
- pgvector column on `episodes` (per EPIC-005) — schema only, no retrieval yet.
- Embedding wired through `LLMProvider` interface (per EPIC-004).

**v1:**
- Index lesson content + user's past code into pgvector.
- Retrieval-augmented prompting for tutor responses.
- "Why am I stuck?" reflection agent uses recent episode embeddings.

**v2:**
- Hybrid search (BM25 + vector) for better recall on technical content.
- Index official docs (Python, MDN for TS, etc.).

## Out of scope

- A separate vector database (Pinecone, Qdrant, Weaviate). pgvector is sufficient until proven otherwise — see [ADR-0004](../../docs/architecture/ADR-0004-database.md).
- LLM fine-tuning.

## Stories under this Epic

(To be created when v1 work begins.)

## Exit criteria (v1)

- [ ] Tutor responses cite the lesson section or user-code excerpt they reference.
- [ ] Retrieval latency is sub-second for index sizes up to 100k embeddings.

## Related

- ADR: [`ADR-0004-database`](../../docs/architecture/ADR-0004-database.md)
- Vision: [`docs/vision/GROOMED_FEATURES.md`](../../docs/vision/GROOMED_FEATURES.md) § Theme 11

## Activity log

- 2026-04-25 — created
