---
id: EPIC-015
title: SaaS readiness (multi-tenant primitives, data export, auth)
type: epic
status: backlog
priority: P1
phase: mvp
tags: [saas, multi-tenant, auth, data-export]
created: 2026-04-25
updated: 2026-04-25
---

## Goal

Build now the primitives that make a future SaaS migration a config flip, not a rewrite: `org_id` on every row, an `Auth` adapter, an `ObjectStore` adapter, GDPR-style data export, and a `Telemetry` adapter. None of the SaaS UI ships in MVP — but the data and code shape are ready for it.

## Scope

**MVP:**
- `org_id` column on every relational table from day 1 (defaulted on self-hosted to a single org).
- Auth.js (NextAuth) with email magic link + GitHub OAuth.
- `Auth` adapter interface — single-user impl now; multi-tenant impl is a swap later.
- `ObjectStore` interface (local FS / MinIO impl now; S3 / R2 later).
- `Telemetry` interface (console impl now; OpenTelemetry / managed APM later).
- GDPR-style JSON data export (`/api/export` returns profile + episodes).

**v3 (SaaS launch):**
- Orgs UI (invite teammates, switch org).
- Subscription plans (free / pro / team) via Stripe.
- Admin panels.
- Usage metering and billing.
- SAML / SSO for enterprise tier.
- Feature flags (GrowthBook self-hosted) for plan-gating.

## Out of scope

- Any SaaS UI in MVP / v1 / v2.
- Custom CRM, marketing automation, etc.

## Stories under this Epic

(MVP stories belong to other Epics — `org_id` is in EPIC-005, auth is in EPIC-002 onboarding, data export is in EPIC-002, etc. SaaS-specific stories will be created in v3 planning.)

## Exit criteria (MVP)

- [ ] Every table has an `org_id` column (defaulted appropriately).
- [ ] `Auth`, `ObjectStore`, `Telemetry` interfaces exist with one impl each.
- [ ] Data export endpoint returns a complete dump of the user's data as JSON.

## Related

- ADR: [`ADR-0005-license`](../../docs/architecture/ADR-0005-license.md) (BSL 1.1 protects the SaaS path)
- Recommended additions: GDPR-style data export

## Activity log

- 2026-04-25 — created
