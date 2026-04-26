import { z } from "zod";
import {
  DifficultyTierSchema,
  type DifficultyTier,
  type EpisodeSummary,
  type LearnerProfile,
  type PolicyTelemetrySink,
  type ProblemRef,
} from "./types.js";
import { NullPolicyTelemetrySink, digest } from "./telemetry.js";

export const DifficultyRulesSchema = z.object({
  ewma_alpha: z.number().min(0).max(1),
  step_up_threshold: z.number().min(0).max(1),
  step_down_threshold: z.number().min(0).max(1),
  min_history: z.number().int().min(1),
  cold_start_difficulty: DifficultyTierSchema,
});
export type DifficultyRules = z.infer<typeof DifficultyRulesSchema>;

export const DEFAULT_DIFFICULTY_RULES: DifficultyRules = {
  ewma_alpha: 0.4,
  step_up_threshold: 0.75,
  step_down_threshold: 0.35,
  min_history: 3,
  cold_start_difficulty: "easy",
};

const TIER_ORDER: readonly DifficultyTier[] = ["easy", "medium", "hard", "expert"];

export const DifficultyDecisionSchema = z.object({
  recommended_difficulty: DifficultyTierSchema,
  top_problems: z.array(z.string()),
  rationale: z.string(),
});
export type DifficultyDecision = z.infer<typeof DifficultyDecisionSchema>;

export interface DifficultyPolicy {
  readonly name: string;
  recommend(input: {
    profile: LearnerProfile;
    recent_episodes: EpisodeSummary[];
    catalog: ProblemRef[];
    target_concept_ids: string[];
  }): DifficultyDecision;
}

export class EloEwmaPolicy implements DifficultyPolicy {
  readonly name = "elo-ewma";

  constructor(
    private readonly rules: DifficultyRules = DEFAULT_DIFFICULTY_RULES,
    private readonly telemetry: PolicyTelemetrySink = new NullPolicyTelemetrySink(),
  ) {}

  recommend(input: {
    profile: LearnerProfile;
    recent_episodes: EpisodeSummary[];
    catalog: ProblemRef[];
    target_concept_ids: string[];
  }): DifficultyDecision {
    const decision = this.compute(input);

    this.telemetry.record({
      policy: "difficulty",
      implementation: this.name,
      user_id: input.profile.user_id,
      inputs_digest: digest({
        recent: input.recent_episodes.length,
        targets: input.target_concept_ids,
      }),
      output_digest: digest(decision),
      decided_at: new Date().toISOString(),
    });

    return decision;
  }

  private compute(input: {
    profile: LearnerProfile;
    recent_episodes: EpisodeSummary[];
    catalog: ProblemRef[];
    target_concept_ids: string[];
  }): DifficultyDecision {
    const lastDifficulty = this.lastDifficulty(input.recent_episodes);
    const targetSet = new Set(input.target_concept_ids);
    const relevantEpisodes = input.recent_episodes.filter((e) =>
      e.concept_ids.some((c) => targetSet.has(c)),
    );

    if (relevantEpisodes.length < this.rules.min_history) {
      const tier = this.skillFloorTier(input.profile, input.target_concept_ids);
      return {
        recommended_difficulty: tier,
        top_problems: this.pick(input.catalog, targetSet, tier),
        rationale: `cold-start (history=${relevantEpisodes.length}) → tier=${tier}`,
      };
    }

    const ewma = this.ewmaSuccess(relevantEpisodes);
    let tier = lastDifficulty ?? this.rules.cold_start_difficulty;

    if (ewma >= this.rules.step_up_threshold) tier = stepTier(tier, +1);
    else if (ewma <= this.rules.step_down_threshold) tier = stepTier(tier, -1);

    return {
      recommended_difficulty: tier,
      top_problems: this.pick(input.catalog, targetSet, tier),
      rationale: `ewma_success=${ewma.toFixed(2)} → tier=${tier}`,
    };
  }

  private ewmaSuccess(episodes: EpisodeSummary[]): number {
    const a = this.rules.ewma_alpha;
    let s = 0;
    let w = 0;
    for (const e of episodes) {
      const x = this.successScore(e);
      s = a * x + (1 - a) * s;
      w = a + (1 - a) * w;
    }
    return w === 0 ? 0 : s / w;
  }

  private successScore(e: EpisodeSummary): number {
    if (!e.passed) return 0;
    if (e.reveal_clicked) return 0;
    if (e.submit_count > 1 || e.hints_used > 0) return 0.5;
    return 1;
  }

  private lastDifficulty(episodes: EpisodeSummary[]): DifficultyTier | undefined {
    return episodes.at(-1)?.difficulty;
  }

  private skillFloorTier(profile: LearnerProfile, targets: string[]): DifficultyTier {
    const targetSet = new Set(targets);
    const skills = profile.concept_skills
      .filter((c) => targetSet.has(c.concept_id))
      .map((c) => c.skill);
    if (skills.length === 0) return this.rules.cold_start_difficulty;
    const min = Math.min(...skills);
    if (min < 0.25) return "easy";
    if (min < 0.55) return "medium";
    if (min < 0.8) return "hard";
    return "expert";
  }

  private pick(catalog: ProblemRef[], targets: Set<string>, tier: DifficultyTier): string[] {
    return catalog
      .filter((p) => p.difficulty === tier && p.concept_ids.some((c) => targets.has(c)))
      .slice(0, 3)
      .map((p) => p.problem_id);
  }
}

function stepTier(tier: DifficultyTier, delta: number): DifficultyTier {
  const idx = TIER_ORDER.indexOf(tier);
  const next = Math.max(0, Math.min(TIER_ORDER.length - 1, idx + delta));
  return TIER_ORDER[next] as DifficultyTier;
}
