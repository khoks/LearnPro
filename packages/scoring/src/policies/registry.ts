import { z } from "zod";
import {
  RuleBasedScoringPolicy,
  type ScoringPolicy,
  type ScoringRules,
  ScoringRulesSchema,
  DEFAULT_SCORING_RULES,
} from "./scoring-policy.js";
import { WarmCoachConstantPolicy, type TonePolicy } from "./tone-policy.js";
import {
  EloEwmaPolicy,
  type DifficultyPolicy,
  type DifficultyRules,
  DifficultyRulesSchema,
  DEFAULT_DIFFICULTY_RULES,
} from "./difficulty-policy.js";
import { AlwaysConfirmPolicy, type AutonomyPolicy } from "./autonomy-policy.js";
import type { PolicyTelemetrySink } from "./types.js";
import { NullPolicyTelemetrySink } from "./telemetry.js";

export const PolicyConfigSchema = z.object({
  scoring: z
    .object({
      implementation: z.literal("rule-based-scoring").default("rule-based-scoring"),
      rules: ScoringRulesSchema.optional(),
    })
    .default({ implementation: "rule-based-scoring" }),
  tone: z
    .object({
      implementation: z.literal("warm-coach-constant").default("warm-coach-constant"),
    })
    .default({ implementation: "warm-coach-constant" }),
  difficulty: z
    .object({
      implementation: z.literal("elo-ewma").default("elo-ewma"),
      rules: DifficultyRulesSchema.optional(),
    })
    .default({ implementation: "elo-ewma" }),
  autonomy: z
    .object({
      implementation: z.literal("always-confirm").default("always-confirm"),
    })
    .default({ implementation: "always-confirm" }),
});
export type PolicyConfig = z.infer<typeof PolicyConfigSchema>;

export interface PolicyRegistry {
  scoring: ScoringPolicy;
  tone: TonePolicy;
  difficulty: DifficultyPolicy;
  autonomy: AutonomyPolicy;
}

export function buildPolicyRegistry(opts: {
  config?: PolicyConfig;
  telemetry?: PolicyTelemetrySink;
}): PolicyRegistry {
  const config = opts.config ?? PolicyConfigSchema.parse({});
  const telemetry = opts.telemetry ?? new NullPolicyTelemetrySink();

  const scoringRules: ScoringRules = config.scoring.rules ?? DEFAULT_SCORING_RULES;
  const difficultyRules: DifficultyRules = config.difficulty.rules ?? DEFAULT_DIFFICULTY_RULES;

  return {
    scoring: new RuleBasedScoringPolicy(scoringRules, telemetry),
    tone: new WarmCoachConstantPolicy(telemetry),
    difficulty: new EloEwmaPolicy(difficultyRules, telemetry),
    autonomy: new AlwaysConfirmPolicy(telemetry),
  };
}

export function loadPolicyConfigFromEnv(env: NodeJS.ProcessEnv): PolicyConfig {
  const raw = env["LEARNPRO_POLICY_CONFIG"];
  if (!raw) return PolicyConfigSchema.parse({});
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`LEARNPRO_POLICY_CONFIG is not valid JSON: ${(err as Error).message}`);
  }
  return PolicyConfigSchema.parse(parsed);
}
