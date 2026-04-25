---
id: EPIC-016
title: Security & anti-cheat (sandbox hardening, honesty mode)
type: epic
status: backlog
priority: P0
phase: mvp
tags: [security, anti-cheat, hardening, trust]
created: 2026-04-25
updated: 2026-04-25
---

## Goal

Two related concerns under one Epic:

1. **Sandbox security** — run untrusted user code without compromising the host. The single most important non-negotiable in the system.
2. **Anti-cheat / honesty** — if users paste LLM answers from another tab, the learner profile becomes garbage and "adaptive" stops being adaptive. Detect respectfully, not punitively.

## Scope

**MVP (security):**
- All hardening checklist items from [ADR-0002](../../docs/architecture/ADR-0002-sandbox.md): no network, read-only rootfs, tmpfs `/tmp`, cgroups, wall-clock timeout, output truncation, drop all caps, non-root UID, seccomp profile.
- Documented attempted-breakout exercise (e.g., Python `socket.socket().connect((...))` is blocked).
- Runner host isolated from API host.

**v1 (anti-cheat):**
- Paste detection in Monaco editor.
- Keystroke entropy / timing analysis.
- "I got help" toggle — gentle prompt rather than punitive flag.
- Profile updates weight self-flagged "got help" episodes appropriately.

**v2+:**
- Periodic security audit cadence.
- Dependency scanning in CI.

## Out of scope

- Hardware-based attestation (overkill).
- Aggressive screenshot detection / anti-screenshare (privacy-invasive and unhelpful).

## Stories under this Epic

(STORY-010 — Verify sandbox hardening checklist — lives under EPIC-003 since it's a sandbox capability, but contributes here.)

(Anti-cheat stories will be created when v1 work begins.)

## Exit criteria (MVP)

- [ ] All [ADR-0002](../../docs/architecture/ADR-0002-sandbox.md) hardening items verified.
- [ ] Documented attempted-breakout exercise passes (i.e., the breakout attempt fails as expected).
- [ ] No `--privileged` Docker invocation anywhere in the codebase or infra.

## Related

- ADR: [`ADR-0002-sandbox`](../../docs/architecture/ADR-0002-sandbox.md)
- Recommended additions: Anti-cheat / honesty mode

## Activity log

- 2026-04-25 — created
