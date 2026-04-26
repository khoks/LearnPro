# `docs/decisions/`

Where future ADRs that are **not** about top-level architecture live. The 5 day-1 ADRs (monorepo, sandbox, llm-provider, database, license) live in [`docs/architecture/`](../architecture/) because they shape the entire system.

This folder is for **smaller, scoped decisions** discovered during build:

- "Why we picked Resend over Postmark for email."
- "Why we use IVFFlat over HNSW for the pgvector index."
- "Why hint-XP costs are 5/15/30 instead of 1/2/3."

**Naming convention:** `ADR-NNNN-kebab-case-title.md` continuing the same numbering as `docs/architecture/` (so the next ADR after ADR-0005 is ADR-0006, regardless of which folder it lives in). When in doubt: if the decision changes the *system shape*, it's an architecture ADR; otherwise it's a decision ADR.

**Format:** same as the architecture ADRs — Context / Decision / Consequences / Alternatives.

## Lighter-weight decisions: `DECISIONS_LOG.md`

Not every decision deserves a full ADR. Cross-cutting product or engineering judgment calls that came up in conversation — "we'll defer X," "we picked Y over Z because…," "MVP scope now includes…" — go into [`DECISIONS_LOG.md`](./DECISIONS_LOG.md) as dated entries. The `harvest-knowledge` skill writes these automatically at the end of relevant sessions. If a log entry later grows into a system-shape decision, promote it to a full ADR and link back.
