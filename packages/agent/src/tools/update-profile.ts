import { z } from "zod";
import {
  DEFAULT_DIFFICULTY_HEURISTIC,
  updateSkillScore,
  type ConceptSkill,
  type DifficultyHeuristicConfig,
  type EpisodeSignalInput,
} from "@learnpro/scoring";
import type { UpdateProfileDeps } from "../ports.js";
import { FinalOutcomeSchema, type FinalOutcome } from "../state.js";

export const UpdateProfileInputSchema = z.object({
  episode_id: z.string().uuid(),
  outcome: FinalOutcomeSchema,
  passed: z.boolean(),
  reveal_clicked: z.boolean().default(false),
  submit_count: z.number().int().min(1),
  // The state-machine driver supplies these from the live TutorState — clients of the API never
  // hand them in directly.
  hints_used: z.number().int().min(0),
  finished_at_ms: z.number().int().nonnegative(),
});
export type UpdateProfileInput = z.input<typeof UpdateProfileInputSchema>;

export const UpdateProfileOutputSchema = z.object({
  episode_id: z.string().uuid(),
  final_outcome: FinalOutcomeSchema,
  time_to_solve_ms: z.number().int().nonnegative(),
  attempts: z.number().int().min(0),
  hints_used: z.number().int().min(0),
  // Per-concept skill score updates that landed. Concept tags missing from the DB are silently
  // skipped (population is STORY-032's job).
  skill_updates: z.array(
    z.object({
      concept_id: z.string(),
      concept_slug: z.string(),
      prev_skill: z.number(),
      next_skill: z.number(),
      next_confidence: z.number(),
      attempts: z.number().int().min(0),
    }),
  ),
});
export type UpdateProfileOutput = z.infer<typeof UpdateProfileOutputSchema>;

export interface UpdateProfileTool {
  readonly name: "updateProfile";
  run(input: UpdateProfileInput): Promise<UpdateProfileOutput>;
}

export interface CreateUpdateProfileToolOptions {
  deps: UpdateProfileDeps;
  difficulty_config?: DifficultyHeuristicConfig;
}

export class UpdateProfileEpisodeMissingError extends Error {
  readonly episode_id: string;
  constructor(episode_id: string) {
    super(`updateProfile: episode not found: ${episode_id}`);
    this.name = "UpdateProfileEpisodeMissingError";
    this.episode_id = episode_id;
  }
}

export function deriveFinalOutcome(opts: {
  passed: boolean;
  hints_used: number;
  reveal_clicked: boolean;
  abandoned: boolean;
}): FinalOutcome {
  if (opts.abandoned) return "abandoned";
  if (opts.reveal_clicked) return "revealed";
  if (!opts.passed) return "failed";
  if (opts.hints_used > 0) return "passed_with_hints";
  return "passed";
}

export function createUpdateProfileTool(opts: CreateUpdateProfileToolOptions): UpdateProfileTool {
  const config = opts.difficulty_config ?? DEFAULT_DIFFICULTY_HEURISTIC;

  return {
    name: "updateProfile",
    async run(rawInput) {
      const input = UpdateProfileInputSchema.parse(rawInput);
      const ctx = await opts.deps.loadEpisodeForClose({ episode_id: input.episode_id });
      if (!ctx) throw new UpdateProfileEpisodeMissingError(input.episode_id);

      const time_to_solve_ms = Math.max(0, input.finished_at_ms - ctx.started_at);
      const attempts = Math.max(ctx.attempts, input.submit_count);
      const hints_used = Math.max(ctx.hints_used, input.hints_used);

      await opts.deps.closeEpisode({
        episode_id: input.episode_id,
        final_outcome: input.outcome,
        time_to_solve_ms,
        attempts,
        hints_used,
      });

      const signal: EpisodeSignalInput = {
        passed: input.passed,
        reveal_clicked: input.reveal_clicked,
        hints_used,
        submit_count: Math.max(1, input.submit_count),
        time_to_solve_ms,
        expected_time_ms: Math.max(1, ctx.problem.expected_median_time_to_solve_ms),
      };

      const conceptSlugs = ctx.problem.concept_tags;
      const idMap = await opts.deps.resolveConceptIds({
        org_id: ctx.org_id,
        language: ctx.problem.language,
        slugs: conceptSlugs,
      });

      const skill_updates: UpdateProfileOutput["skill_updates"] = [];
      for (const slug of conceptSlugs) {
        const concept_id = idMap.get(slug);
        if (!concept_id) continue;
        const prev =
          (await opts.deps.loadSkillScore({
            user_id: ctx.user_id,
            concept_id,
          })) ?? coldStartSkill(concept_id);
        const next = updateSkillScore(prev, signal, config);
        await opts.deps.upsertSkillScore({
          user_id: ctx.user_id,
          org_id: ctx.org_id,
          concept_id,
          skill: next,
        });
        skill_updates.push({
          concept_id,
          concept_slug: slug,
          prev_skill: prev.skill,
          next_skill: next.skill,
          next_confidence: next.confidence,
          attempts: next.attempts,
        });
      }

      return {
        episode_id: input.episode_id,
        final_outcome: input.outcome,
        time_to_solve_ms,
        attempts,
        hints_used,
        skill_updates,
      };
    },
  };
}

export function coldStartSkill(concept_id: string): ConceptSkill {
  return { concept_id, skill: 0.5, confidence: 0, attempts: 0 };
}
