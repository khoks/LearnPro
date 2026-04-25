# `docs/decisions/`

Where future ADRs that are **not** about top-level architecture live. The 5 day-1 ADRs (monorepo, sandbox, llm-provider, database, license) live in [`docs/architecture/`](../architecture/) because they shape the entire system.

This folder is for **smaller, scoped decisions** discovered during build:

- "Why we picked Resend over Postmark for email."
- "Why we use IVFFlat over HNSW for the pgvector index."
- "Why hint-XP costs are 5/15/30 instead of 1/2/3."

**Naming convention:** `ADR-NNNN-kebab-case-title.md` continuing the same numbering as `docs/architecture/` (so the next ADR after ADR-0005 is ADR-0006, regardless of which folder it lives in). When in doubt: if the decision changes the *system shape*, it's an architecture ADR; otherwise it's a decision ADR.

**Format:** same as the architecture ADRs — Context / Decision / Consequences / Alternatives.
