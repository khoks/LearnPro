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

- [STORY-056](../stories/STORY-056-data-retention-and-redaction.md) — Data retention & redaction pipeline (raw transcripts + episodic summaries) (MVP)

(STORY-010 — Verify sandbox hardening checklist — lives under EPIC-003 since it's a sandbox capability, but contributes here.)

(Anti-cheat stories will be created when v1 work begins.)

## Exit criteria (MVP)

- [ ] All [ADR-0002](../../docs/architecture/ADR-0002-sandbox.md) hardening items verified.
- [ ] Documented attempted-breakout exercise passes (i.e., the breakout attempt fails as expected).
- [ ] No `--privileged` Docker invocation anywhere in the codebase or infra.

## Related

- ADR: [`ADR-0002-sandbox`](../../docs/architecture/ADR-0002-sandbox.md)
- Recommended additions: Anti-cheat / honesty mode

## Design notes & alternatives

See [`docs/product/UX_DETAILS.md § EPIC-016`](../../docs/product/UX_DETAILS.md#epic-016--security--anti-cheat) for the full deep-dive. Tutor-side anti-cheat behavior is in the [`EPIC-004 § Cheating detection`](../../docs/product/UX_DETAILS.md#cheating-detection-philosophy) section.

Key locked decisions for this Epic:
- **Sandbox security is invisible when working.** Network-block error: "Network access is disabled. Sandboxes are isolated for safety." Memory cap: "Out of memory. Are you building a list bigger than necessary?" Brief, framed as learning hints, not security lectures.
- **Anti-cheat philosophy: detect respectfully, never punitively.** LearnPro doesn't police cheating. The profile is the user's own; if they sabotage it, they sabotage themselves.
- **Soft signals only in MVP**: `paste_ratio`, `time_on_problem`, `hint_rungs_used`. Logged silently. **No accusations, ever.**
- **Optional "I got help on this one" toggle** (off by default). When on: submission is graded but does NOT count toward concept mastery. Feature for honest learners.
- **Keystroke entropy / paste-confirm modal / honesty mode (paste-lock) deferred to v1.**
- **Self-hosters get a `SECURITY.md` linked from settings** with threat model + hardening checklist + vuln-report process.
- **2FA → v1; SSO/SAML, audit logs → v3 SaaS.**

Alternatives considered (no sandboxing for MVP, surfacing security as a UI feature, MVP keystroke-based anti-cheat): see UX_DETAILS for rationale.

## Activity log

- 2026-04-25 — created
- 2026-04-25 — Path A scope: added [STORY-056](../stories/STORY-056-data-retention-and-redaction.md). Keeping both raw + episodic memories raises privacy blast-radius enough to need a real retention + redaction policy as MVP, not v1.
