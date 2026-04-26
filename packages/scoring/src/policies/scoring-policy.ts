import { z } from "zod";
import {
  type DifficultyTier,
  type EpisodeSummary,
  type LearnerProfile,
  type PolicyTelemetrySink,
} from "./types.js";
import { NullPolicyTelemetrySink, digest } from "./telemetry.js";

export const ScoringRulesSchema = z.object({
  base_xp: z.number().min(0),
  difficulty_factors: z.record(z.string(), z.number().min(0)),
  first_try_no_hints_multiplier: z.number().min(0).max(1),
  hints_used_multiplier: z.number().min(0).max(1),
  multiple_submits_multiplier: z.number().min(0).max(1),
  reveal_clicked_multiplier: z.number().min(0).max(1),
  mastery_delta_per_pass: z.number().min(0).max(1),
  mastery_delta_per_fail: z.number().min(-1).max(0),
});
export type ScoringRules = z.infer<typeof ScoringRulesSchema>;

export const DEFAULT_SCORING_RULES: ScoringRules = {
  base_xp: 10,
  difficulty_factors: { easy: 1.0, medium: 1.5, hard: 2.0, expert: 3.0 },
  first_try_no_hints_multiplier: 1.0,
  hints_used_multiplier: 0.7,
  multiple_submits_multiplier: 0.5,
  reveal_clicked_multiplier: 0.0,
  mastery_delta_per_pass: 0.05,
  mastery_delta_per_fail: -0.02,
};

export const ScoringDecisionSchema = z.object({
  xp: z.number().min(0),
  mastery_delta: z.number().min(-1).max(1),
  signals: z.array(z.string()),
});
export type ScoringDecision = z.infer<typeof ScoringDecisionSchema>;

export interface ScoringPolicy {
  readonly name: string;
  score(input: { episode: EpisodeSummary; profile: LearnerProfile }): ScoringDecision;
}

export class RuleBasedScoringPolicy implements ScoringPolicy {
  readonly name = "rule-based-scoring";

  constructor(
    private readonly rules: ScoringRules = DEFAULT_SCORING_RULES,
    private readonly telemetry: PolicyTelemetrySink = new NullPolicyTelemetrySink(),
  ) {}

  score(input: { episode: EpisodeSummary; profile: LearnerProfile }): ScoringDecision {
    const decision = this.compute(input.episode);

    this.telemetry.record({
      policy: "scoring",
      implementation: this.name,
      user_id: input.profile.user_id,
      inputs_digest: digest(input.episode),
      output_digest: digest(decision),
      decided_at: new Date().toISOString(),
    });

    return decision;
  }

  private compute(episode: EpisodeSummary): ScoringDecision {
    const signals: string[] = [];
    const factor = this.rules.difficulty_factors[episode.difficulty as DifficultyTier];
    if (factor === undefined) {
      throw new Error(`No difficulty factor configured for tier "${episode.difficulty}"`);
    }

    let multiplier = this.rules.first_try_no_hints_multiplier;
    if (episode.reveal_clicked) {
      multiplier = this.rules.reveal_clicked_multiplier;
      signals.push("reveal_clicked");
    } else if (episode.submit_count > 1) {
      multiplier = this.rules.multiple_submits_multiplier;
      signals.push("multiple_submits");
    } else if (episode.hints_used > 0) {
      multiplier = this.rules.hints_used_multiplier;
      signals.push("hints_used");
    } else if (episode.passed) {
      signals.push("first_try_no_hints");
    }

    const xp = episode.passed ? Math.round(this.rules.base_xp * factor * multiplier) : 0;
    const mastery_delta = episode.passed
      ? this.rules.mastery_delta_per_pass * factor
      : this.rules.mastery_delta_per_fail;

    if (!episode.passed) signals.push("not_passed");

    return { xp, mastery_delta, signals };
  }
}
