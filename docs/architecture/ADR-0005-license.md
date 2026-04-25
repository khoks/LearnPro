# ADR-0005 — License: BSL 1.1, converting to Apache 2.0 on 2030-04-25

- **Status:** Accepted (2026-04-25)
- **Deciders:** Rahul (project owner)
- **Phase:** Scaffolding (pre-MVP)

## Context

LearnPro is built as a self-hosted, open-source project today, with the explicit intent of becoming a SaaS product later. The license choice has direct business implications:

- A **permissive license (MIT, Apache 2.0)** allows anyone — including a competitor — to take the code and run it as a paid SaaS, undercutting any future revenue.
- A **strong copyleft license (AGPL)** discourages SaaS forking but also discourages corporate adoption and self-hosting in commercial contexts (legal review burden).
- A **source-available license (BSL, Elastic License, SSPL)** is free for self-hosting but explicitly prohibits competitive hosted offerings, with a time-limited conversion to open-source.

Comparable projects have made this same trade:

- **Sentry** — BSL 1.1 → Apache 2.0 after 4 years.
- **CockroachDB** — BSL 1.1 → Apache 2.0 after 3 years.
- **MariaDB MaxScale** — BSL 1.1 (originator of the license).
- **HashiCorp** (Terraform, Vault, Consul) — moved from MPL 2.0 to BSL in 2023.

## Decision

License under **Business Source License 1.1**, with:

- **Licensor:** Rahul Singh Khokhar
- **Licensed Work:** LearnPro, © 2026 Rahul Singh Khokhar
- **Change Date:** 2030-04-25 (4 years after first commit)
- **Change License:** Apache License, Version 2.0
- **Additional Use Grant:** Permits self-hosting for personal, team, school, or company-internal use. Prohibits offering LearnPro to third parties as a hosted "LearnPro Service" that competes with the Licensor's offering.

The full text is in `LICENSE` at the repo root.

## Consequences

**Positive:**
- Anyone can clone, modify, and self-host LearnPro for free for almost any non-competitive use — preserving the open, community-friendly ethos.
- A competitor cannot legally take the code and launch a paid LearnPro-competing SaaS until the Change Date.
- After 4 years, the code automatically becomes Apache 2.0 — no risk of the project being "trapped" indefinitely behind a restrictive license.
- BSL is a known quantity in the ecosystem (Sentry, CockroachDB) — most engineers and lawyers have a baseline understanding.

**Negative:**
- BSL is **not OSI-approved**. Some communities, package managers, and corporate legal teams treat non-OSI licenses with suspicion. May reduce contributor velocity early.
- The "Additional Use Grant" wording requires care — too narrow and self-hosting is chilled; too broad and the SaaS protection evaporates. The wording in `LICENSE` errs toward permissive self-hosting.
- The specific clause about "GPL Version 2.0 or compatible" in BSL 1.1 covenant 1 is debated when Apache 2.0 is chosen as the Change License (Apache 2.0 is GPLv3-compatible, not GPLv2). Industry practice (Sentry, CockroachDB) accepts this; we follow precedent.

**Neutral:**
- Future re-licensing (e.g., to MIT or AGPL) is possible if the business strategy shifts, with the usual contributor-license-agreement complications.
- If the project remains a side-project hobby, the BSL provides essentially the same de facto freedoms as MIT.

## Re-evaluation triggers

This ADR should be revisited if:
- The project gains substantial outside contributors and BSL is hindering them.
- The SaaS commercialization plan is abandoned (in which case Apache 2.0 might be more welcoming).
- A new license (e.g., FSL, Functional Source License) gains broader ecosystem trust.
