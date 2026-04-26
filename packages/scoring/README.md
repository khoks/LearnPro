# `@learnpro/scoring`

Home of the cross-cutting policy adapters: `ScoringPolicy`, `TonePolicy`, `DifficultyPolicy`, `AutonomyPolicy`. The architectural backbone of [Path A](../../docs/decisions/DECISIONS_LOG.md).

See [`POLICIES.md`](./POLICIES.md) for the rationale behind each MVP default and the v1 GenAI swap-in path.

## Quick use

```ts
import { buildPolicyRegistry, loadPolicyConfigFromEnv } from "@learnpro/scoring";

const registry = buildPolicyRegistry({
  config: loadPolicyConfigFromEnv(process.env),
});

registry.scoring.score({ episode, profile });
registry.tone.decide({ profile, context });
registry.difficulty.recommend({ profile, recent_episodes, catalog, target_concept_ids });
registry.autonomy.decide({ profile, consequence: "consequential" });
```

## Operator config

Set `LEARNPRO_POLICY_CONFIG` to a JSON document conforming to `PolicyConfigSchema` to override implementations or rules without a redeploy.
