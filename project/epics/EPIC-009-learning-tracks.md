---
id: EPIC-009
title: Learning tracks (content + curriculum format)
type: epic
status: backlog
priority: P0
phase: mvp
tags: [content, tracks, curriculum]
created: 2026-04-25
updated: 2026-04-25
---

## Goal

Define the structure for learning content (a "track" — sequence of concepts and problems toward a goal) and ship the first two tracks (Python fundamentals, TypeScript fundamentals) in MVP. Expand to more languages, frameworks, and ML/DL paths in later phases.

## Scope

**MVP:**
- Track definition format (YAML or JSON) — declarative authoring surface for new content.
- Two tracks: Python fundamentals, TypeScript fundamentals (~30 problems each).

**v1+:**
- Coding tracks for Go, Rust, Java, Kotlin, C.
- Data structures & algorithms track (cross-language).
- Framework starter tracks (React first).

**v2+:**
- Classical ML track (scikit-learn, pandas).
- Deep learning + NN-from-scratch track (PyTorch, math foundations).
- Cross-track prerequisites (uses skill graph).

**v3+:**
- "Build an LLM from scratch" capstone track.
- System-design teaching track.
- Custom user-defined tracks (power users / instructors).

## Out of scope

- Per-problem authoring (lives under EPIC-007).
- Operator dashboards for content authoring (v2+).

## Stories under this Epic

- STORY-020 — Track definition format (YAML/JSON) (MVP)

(Problem authoring stories live under EPIC-007.)

## Exit criteria (MVP)

- [ ] Both Python and TypeScript fundamentals tracks load from declarative files.
- [ ] Adding a third track requires only a new file, no code changes.

## Related

- Vision: [`docs/vision/GROOMED_FEATURES.md`](../../docs/vision/GROOMED_FEATURES.md) § Theme 6

## Activity log

- 2026-04-25 — created
