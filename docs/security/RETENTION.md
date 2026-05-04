# Data retention & redaction policy

> **Status:** in force as of STORY-056 (2026-05-01).
> Self-hosted operators can override the windows via the env vars listed below; SaaS uses these defaults.

---

## TL;DR

| What | Window | Sweeper |
|---|---|---|
| Raw LLM prompts / responses | 90 days, then anonymized | `sweepRawLlmCalls` (no-op until raw-text columns land) |
| Voice transcripts (interactions where `type='voice'`) | **30 days**, then deleted | `sweepVoiceTranscripts` |
| Other interaction telemetry (cursor / edit / submit / hint / etc.) | 90 days, then aggregated into `episodes.interactions_summary` and the raw rows deleted | `sweepInteractionTelemetry` |
| Episode summaries (`episodes` rows + `interactions_summary` jsonb) | indefinite (until user requests deletion) | n/a |
| Notifications | 30 days | `gcOldNotifications` (STORY-023) |
| Aggregate LLM cost / latency (model, tokens, cost) | indefinite | n/a |

All sweepers are **idempotent** — running `sweepAll` twice in the same hour produces no extra writes after the first run.

The dual gate for voice: **voice opt-in** (STORY-055) plus **voice-30-day-retention** (this Story) means even users who opt in get short retention by default.

---

## Why these windows

- **Raw LLM prompts/responses** include the user's typed code, the tutor's prose responses, and any free-text the user dropped in. These are the highest-value debug data and the highest-risk PII surface. 90 days covers a full quarterly debugging cycle while bounding worst-case blast radius.
- **Voice transcripts** are the most invasive capture surface (someone speaking out loud in their kitchen). Even after on-device transcription, the resulting text can hold names, addresses, side-channel context. 30 days is enough for cross-session continuity without becoming a long-tail leak vector.
- **Other interaction telemetry** is structurally low-PII (cursor positions, edit ranges, hint requests). 90 days lines up with the raw-LLM window so an episode's full debug picture survives or expires together. After the window we keep aggregate counts so cohort analytics still work.
- **Episode summaries** are the long-term skill record — score history, mastered concepts, failure patterns. They're what the adaptive systems read from. They stay until the user closes the account.

---

## Redaction pipeline

Redaction runs **at ingestion**, before any free-text field hits the DB. There is no "raw + redaction-on-read" mode — once the row lands, the PII is already gone.

### 5 pattern categories

Implemented in [`packages/shared/src/redaction.ts`](../../packages/shared/src/redaction.ts):

1. **email** — standard email regex (case-insensitive).
2. **phone** — US 10-digit (with optional `(NNN)` parentheses) + E.164 international (`+CC...` with 6+ digits and various separators). 4-digit years and other short numbers don't match.
3. **url** — `https?://...` with trailing-punctuation trim. Opt-out via `allowUrls: true` (used in tutor code submissions where doc links are common).
4. **credit_card** — 13-19 digit groups with optional separators, **Luhn-checked**. Random 16-digit IDs don't false-positive; the `4242 4242 4242 4242` Stripe test card does.
5. **gov_id** — US SSN literal (`NNN-NN-NNNN`), plus labelled identifier blocks (`Customer ID: 123456789`, `SSN# 987654321`, `Aadhaar 12345678`, etc.). Conservative — false positives are tolerable; false negatives would be a privacy bug.

Each match is replaced with `[REDACTED:{type}]` so reviewers can grep for what categories appeared without seeing the original content.

### LLM second pass (Haiku-backed)

Implemented in [`packages/redaction/src/llm-assisted.ts`](../../packages/redaction/src/llm-assisted.ts).

- Runs **only when** the regex pass found nothing high-confidence (saves tokens).
- System prompt asks Haiku to flag full personal names paired with identifying context, street addresses, dates of birth, IBAN/SWIFT/account numbers, medical IDs.
- Response is JSON-schema'd: `{ additional_redactions: [{ type, span_start, span_end }] }`. Parse failures → fall back to regex-only result (privacy-safe degradation — we never trust prose).
- Hallucinated spans (out-of-bounds offsets) are silently dropped.
- `NoopLlmRedactor` is the dev/test default; `HaikuLlmAssistedRedactor` is the prod wiring.

### Where redaction is wired

| Endpoint | Field | Notes |
|---|---|---|
| `POST /v1/interactions` | `payload.transcript` (voice events only) | Adds `payload.redaction_summary.types_scrubbed` |
| `POST /v1/onboarding/turn` | every user message | Redacted before reaching the LLM and before `agent_calls` log |
| `POST /v1/tutor/episodes/:id/submit` | `code` | `allowUrls: true` (preserves doc links); emails/phones/IDs/cards still scrubbed |

Test coverage: [`apps/api/src/index.test.ts`](../../apps/api/src/index.test.ts), [`apps/api/src/onboarding.test.ts`](../../apps/api/src/onboarding.test.ts), [`apps/api/src/tutor.test.ts`](../../apps/api/src/tutor.test.ts) — including the integration check that bypasses the client and posts raw PII directly to the endpoint.

---

## User-facing controls

Backed by [`/settings/data`](../../apps/web/src/app/settings/data/page.tsx) in the web app.

| Control | Effect |
|---|---|
| Show summary | Counts of episodes / submissions / interactions / agent_calls / voice transcripts + last_active_at |
| Remove voice transcripts | Deletes every voice-typed `interactions` row for the user |
| Close account | Cascading delete of users → all referencing rows. `agent_calls.user_id` is set to NULL (cost history survives anonymized). Session cookie is cleared on success; user is redirected to `/auth/signin`. |

The export endpoint from STORY-026 (`GET /v1/export`) remains the way to take everything with you.

---

## Operator wiring

Run the sweepers via system cron (recommended: nightly at 03:00 UTC):

```sh
pnpm --filter @learnpro/db db:retention
```

That calls `sweepAll(db, new Date())` and logs per-sweeper counts. Wrap each sweeper in its own try/catch so a failure in one doesn't block the others.

Override windows via env (defaults are the table at the top):

- `LEARNPRO_RETENTION_RAW_LLM_DAYS` (default 90)
- `LEARNPRO_RETENTION_VOICE_DAYS` (default 30)
- `LEARNPRO_RETENTION_INTERACTIONS_DAYS` (default 90)

(Currently the script uses defaults; env overrides are wired into the function signatures and can be plumbed in by editing `retention-sweep.ts` — kept default-only for now to avoid premature config surface.)

---

## What's intentionally NOT in scope

- **Compliance certification** (SOC 2 / HIPAA) — separate v3 work.
- **DSAR (Data Subject Access Request) automation** beyond the data-export endpoint — STORY-026 covers the export side.
- **E2E encryption of stored data** — encryption at rest is handled at the volume / database level, not per-row.
- **Time-bounded retention for the `episodes` summary** — kept indefinite by design (it's the skill memory).

---

## Related

- [STORY-055 — rich interaction telemetry schema + voice opt-in](../../project/stories/STORY-055-rich-interaction-telemetry-schema.md)
- [STORY-026 — GDPR-style JSON data export](../../project/stories/STORY-026-data-export.md)
- [STORY-056 — this Story](../../project/stories/STORY-056-data-retention-and-redaction.md)
