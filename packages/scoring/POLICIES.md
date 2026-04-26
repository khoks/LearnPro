# `@learnpro/scoring` — policy adapters

This package operationalizes **Path A** ([`docs/decisions/DECISIONS_LOG.md`](../../docs/decisions/DECISIONS_LOG.md), 2026-04-25): MVP runs on deterministic policies behind clean interfaces; v1 swaps in GenAI implementations without touching call sites.

The four policies, their MVP defaults, the rationale, and the v1 swap-in path are documented below. Telemetry: every decision goes through a [`PolicyTelemetrySink`](./src/policies/telemetry.ts) so the [STORY-055 `interactions` table](../../project/stories/STORY-055-rich-interaction-telemetry-schema.md) can audit policy behavior in production.

---

## `ScoringPolicy` → `RuleBasedScoringPolicy`

**Default formula**

```
xp = round(base_xp × difficulty_factor × correctness_multiplier)        when passed
xp = 0                                                                   when failed
mastery_delta = +rules.mastery_delta_per_pass × difficulty_factor        when passed
mastery_delta =  rules.mastery_delta_per_fail                            when failed
```

with `base_xp = 10`, factors `{easy:1, medium:1.5, hard:2, expert:3}`, multipliers `{first_try_no_hints:1.0, hints_used:0.7, multiple_submits:0.5, reveal_clicked:0.0}`. Locked from the gamification UX brief in [`docs/product/UX_DETAILS.md`](../../docs/product/UX_DETAILS.md#xp).

**Why this default**

- Matches the only XP formula the user has explicitly signed off on.
- Operator-injectable via `ScoringRules` so the UX team can A/B without a redeploy.
- `signals[]` (`first_try_no_hints` / `hints_used` / `multiple_submits` / `reveal_clicked` / `not_passed`) flows back into the profile so future policies can reason about _how_ a user solved.

**v1 swap-in (Q1E)**

`GenAIScoringPolicy` — Claude with profile + history as context. Same interface, same call sites.

---

## `TonePolicy` → `WarmCoachConstantPolicy`

**Default behavior:** always `tone: "warm-coach"`, `style_hints: ["specific-not-generic", "reference-actual-code", "brief"]`.

**Why this default**

- Locks the **first-message-quotes-actual-code** rule from [`docs/product/UX_DETAILS.md`](../../docs/product/UX_DETAILS.md) — that's the differentiator we cannot afford to soften before we have signal to do so.
- "Drill-sergeant" / "socratic-strict" tones exist in the schema but are unreachable in MVP. Surface them only when there's measurable engagement data to drive switching.

**v1 swap-in (Q1G)**

`AdaptiveTonePolicy` — reads engagement EWMA + recent-struggle and switches tone when fatigue or boredom is detected.

---

## `DifficultyPolicy` → `EloEwmaPolicy`

**Default behavior**

- Cold-start (fewer than `min_history=3` relevant episodes): pick tier from the _minimum_ concept skill across the targeted concepts (`<0.25→easy`, `<0.55→medium`, `<0.80→hard`, else `expert`).
- Otherwise: EWMA over recent success scores (1.0 clean pass, 0.5 with hints / multi-submit, 0 fail/reveal). EWMA `≥ step_up_threshold (0.75)` → step up; `≤ step_down_threshold (0.35)` → step down.

**Why this default**

- "Time + hints + errors → next difficulty" was specified by the user in [STORY-018](../../project/stories/STORY-018-heuristic-difficulty.md).
- `EloEwmaPolicy` is one rung above naive thresholding: it dampens noise (EWMA) and never lets a single bad attempt cliff a learner two tiers down.
- The **per-concept skill floor** for cold-start prevents the "harder problem than I've ever seen" failure mode in the magic-moment minutes ([UX_DETAILS magic-moment](../../docs/product/UX_DETAILS.md#the-first-session-magic-moment-cross-cutting)).

**v1 swap-in (Q2A / Q2B)**

`MultiDimensionalGenAIPolicy` — IQ-proxy, learner profile, knowledge graph prerequisites.

---

## `AutonomyPolicy` → `AlwaysConfirmPolicy`

**Default behavior:** every decision returns `band: "low"`, `mode: "confirm"`.

**Why this default**

- Cold-start safe. No user has earned the right to be acted-on without confirmation in MVP.
- The _runtime_ `EwmaBandedAutonomyPolicy` (per-user confidence signal → low/medium/high bands) is intentionally deferred to [STORY-054](../../project/stories/STORY-054-adaptive-autonomy-controller.md) so the tutor can ship today without an autonomy controller online.
- The interface still exists in MVP so the tutor's call sites do not change when STORY-054 lands.

**v1 swap-in**

[STORY-054](../../project/stories/STORY-054-adaptive-autonomy-controller.md) `EwmaBandedAutonomyPolicy`, then GenAI per-action policy after that.

---

## DI / config

`buildPolicyRegistry({ config?, telemetry? })` produces a `PolicyRegistry` with all four policies wired. Configuration is loaded from `LEARNPRO_POLICY_CONFIG` (JSON) via `loadPolicyConfigFromEnv(env)`. Both rules and the chosen implementation are config-driven — operators can flip a policy implementation without a code change once additional implementations exist.

The `apps/api` server resolves a `PolicyRegistry` at boot and exposes a `/policies` endpoint (smoke check that DI is live + names of the implementations in use).
