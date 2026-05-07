import { z } from "zod";
import {
  awardXpForEpisode,
  DEFAULT_DIFFICULTY_HEURISTIC,
  DEFAULT_XP_POLICY,
  initialCardState,
  mapEpisodeOutcomeToGrade,
  recomputeAfterReview,
  updateSkillScore,
  type ConceptSkill,
  type DifficultyHeuristicConfig,
  type EpisodeSignalInput,
  type FsrsCardState,
  type XpPolicyConfig,
} from "@learnpro/scoring";
import type { GraderAgentRubric, UpdateProfileDeps } from "../ports.js";
import { FinalOutcomeSchema, type FinalOutcome } from "../state.js";

// STORY-034 — optional grader rubric carried from the most-recent submit() call. When present,
// `applyGraderBonus` adds a small per-concept skill delta (high idiomatic / efficiency rewards).
const GraderAgentRubricInputSchema = z.object({
  pass: z.boolean(),
  rubric: z.object({
    idiomatic: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
    efficiency: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
    test_coverage_thinking: z.union([
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4),
      z.literal(5),
    ]),
  }),
  reasoning: z.string().min(1),
  fallback_used: z.boolean(),
});

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
  // STORY-034 — optional grader rubric, propagated from the most-recent submit. Null on the
  // legacy unified-tutor codepath; pass-with-warning when fallback_used=true (no bonus applied).
  grader_rubric: GraderAgentRubricInputSchema.nullable().optional(),
  // STORY-038a — optional comprehension verdict propagated from the most-recent
  // submitComprehension(). Null on implement/debug episodes (and on legacy fixtures pre-038a).
  // When non-null, the per-concept-tag comprehension-policy EWMA absorbs the signal via the
  // optional `upsertComprehensionScore` dep.
  comprehension_correct: z.boolean().nullable().optional(),
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
      // STORY-034 — additive delta applied on top of the EWMA result from the rubric scores.
      // Optional for backward compatibility with fixtures pre-grader split. The tool's
      // runtime path always sets it (0 or a clamped delta).
      grader_bonus: z.number().optional(),
    }),
  ),
  // STORY-022 — XP grant for this episode. `awarded` is false when an idempotent re-run hit the
  // unique constraint (the second grade call for the same episode + reason is a no-op).
  xp_award: z.object({
    amount: z.number().int().min(0),
    reason: z.string(),
    awarded: z.boolean(),
  }),
  // STORY-015 — true when the planSession item matching this problem's slug went from pending
  // to completed during this close. Idempotent re-runs return false. False when the user has no
  // active plan, or when no plan item matches the slug.
  plan_item_marked: z.boolean(),
  // STORY-031 — per-concept FSRS review writes. Empty array when spaced-repetition isn't wired
  // OR when the problem's concept tags don't resolve to any DB rows. The `grade` is the FSRS
  // discriminator the wrapper computed; the `next_due` is the persisted state's due timestamp
  // so the consumer can show "review again on YYYY-MM-DD" without re-fetching.
  reviews_written: z.array(
    z.object({
      concept_id: z.string(),
      concept_slug: z.string(),
      grade: z.enum(["again", "hard", "good", "easy"]),
      next_due: z.string().datetime(),
    }),
  ),
  // STORY-031 — count of currently-due cards after this close (best-effort, null when the deps
  // adapter doesn't wire countDueConcepts).
  due_concepts_count: z.number().int().min(0).nullable(),
});
export type UpdateProfileOutput = z.infer<typeof UpdateProfileOutputSchema>;

export interface UpdateProfileTool {
  readonly name: "updateProfile";
  run(input: UpdateProfileInput): Promise<UpdateProfileOutput>;
}

export interface CreateUpdateProfileToolOptions {
  deps: UpdateProfileDeps;
  difficulty_config?: DifficultyHeuristicConfig;
  xp_config?: XpPolicyConfig;
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
  const xpConfig = opts.xp_config ?? DEFAULT_XP_POLICY;

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
      const reviews_written: UpdateProfileOutput["reviews_written"] = [];
      const now = new Date(input.finished_at_ms);
      const fsrsGrade = mapEpisodeOutcomeToGrade({
        outcome: input.outcome,
        hints_used,
        time_to_solve_ms,
        expected_time_ms: ctx.problem.expected_median_time_to_solve_ms,
      });

      // STORY-034 — apply the grader rubric ONCE (it's per-submission, not per-concept), then
      // distribute the same bonus to each concept tag. Skip when the grader didn't run, the
      // grader fell back, or the user didn't pass (we don't reward un-passed submissions).
      const graderBonus = applyGraderBonus({
        rubric: input.grader_rubric ?? null,
        passed: input.passed,
      });

      for (const slug of conceptSlugs) {
        const concept_id = idMap.get(slug);
        if (!concept_id) continue;
        const prev =
          (await opts.deps.loadSkillScore({
            user_id: ctx.user_id,
            concept_id,
          })) ?? coldStartSkill(concept_id);
        const baseNext = updateSkillScore(prev, signal, config);
        const next: ConceptSkill = {
          ...baseNext,
          skill: clamp01(baseNext.skill + graderBonus),
        };
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
          grader_bonus: graderBonus,
        });

        // STORY-031 — FSRS review write. Best-effort, swallows DB errors so a hiccup never
        // fails the close. Cold-start: when no card state exists yet, seed via initialCardState.
        if (opts.deps.loadConceptCardState && opts.deps.recordConceptReview) {
          try {
            const priorRaw = await opts.deps.loadConceptCardState({
              user_id: ctx.user_id,
              concept_id,
            });
            const prior: FsrsCardState = priorRaw ?? initialCardState(now);
            const nextState = recomputeAfterReview({
              state: prior,
              grade: fsrsGrade,
              now,
            });
            await opts.deps.recordConceptReview({
              user_id: ctx.user_id,
              org_id: ctx.org_id,
              concept_id,
              next_state: nextState,
            });
            reviews_written.push({
              concept_id,
              concept_slug: slug,
              grade: fsrsGrade,
              next_due: nextState.due,
            });
          } catch {
            // intentional: spaced-repetition write is best-effort; never fail the close.
          }
        }
      }

      // STORY-038a — comprehension-policy axis bump. Fires only when the most-recent submit
      // was a comprehension answer (i.e. comprehension_correct is non-null) AND the deps adapter
      // wired the optional upsertComprehensionScore. One upsert per concept_tag on the
      // problem; got_help propagates so the policy's anti-dark-pattern no-op kicks in.
      // Best-effort: a hiccup never blocks the close (the user already got their XP + skill
      // update on the implement/debug axis if applicable; the comprehension axis can absorb
      // the next signal).
      if (
        input.comprehension_correct !== null &&
        input.comprehension_correct !== undefined &&
        opts.deps.upsertComprehensionScore
      ) {
        for (const slug of conceptSlugs) {
          try {
            await opts.deps.upsertComprehensionScore({
              user_id: ctx.user_id,
              org_id: ctx.org_id,
              concept_tag: slug,
              correct: input.comprehension_correct,
              // STORY-042 — propagate the got_help marker so the comprehension-policy's
              // got_help branch no-ops (anti-dark-pattern: never penalize, just don't reward).
              // Currently always false here — the upstream `wrapWithGotHelpAwareSkillSkip`
              // skipper applies to skill_scores, not the comprehension axis. A future
              // wrapper can extend this when the user asks; for now the dep adapter is
              // responsible for reading `got_help` if it cares.
              got_help: false,
            });
          } catch {
            // intentional: comprehension axis update is best-effort; never fail the close.
          }
        }
      }

      const xpDecision = awardXpForEpisode(
        {
          outcome: input.outcome,
          difficulty: ctx.problem.difficulty,
          hints_used,
        },
        xpConfig,
      );
      const xpResult = await opts.deps.awardXp({
        user_id: ctx.user_id,
        org_id: ctx.org_id,
        episode_id: input.episode_id,
        amount: xpDecision.amount,
        reason: xpDecision.reason,
      });

      // STORY-015 — auto-mark the matching pending plan item completed. Idempotent: the
      // underlying DB helper no-ops on already-completed items, so re-grading the same episode
      // never double-marks. Failures are logged-and-swallowed (caller already got their XP).
      let plan_item_marked = false;
      if (opts.deps.markPlanItemCompleted) {
        try {
          const r = await opts.deps.markPlanItemCompleted({
            user_id: ctx.user_id,
            problem_slug: ctx.problem.slug,
            episode_id: input.episode_id,
          });
          plan_item_marked = r.updated;
        } catch {
          // intentional: plan auto-mark is a best-effort side-effect; never fail the close.
        }
      }

      // STORY-031 — best-effort due-count read for the close response. Returns null when the
      // adapter doesn't wire spaced-repetition.
      let dueCount: number | null = null;
      if (opts.deps.countDueConcepts) {
        try {
          dueCount = await opts.deps.countDueConcepts({ user_id: ctx.user_id });
        } catch {
          dueCount = null;
        }
      }

      // STORY-054 — refresh the autonomy controller's confidence signal. Best-effort: a DB hiccup
      // shouldn't fail the close (the user already passed/failed). Idempotency: re-grading is rare
      // on the request path (the API only calls finish() once per episode); the EWMA absorbs any
      // drift on the next close.
      if (opts.deps.refreshConfidenceSignal) {
        try {
          await opts.deps.refreshConfidenceSignal({
            user_id: ctx.user_id,
            org_id: ctx.org_id,
            episode_id: input.episode_id,
            final_outcome: input.outcome,
            time_to_solve_ms,
            expected_time_ms: Math.max(1, ctx.problem.expected_median_time_to_solve_ms),
          });
        } catch {
          // intentional: signal refresh is best-effort; never fail the close.
        }
      }

      return {
        episode_id: input.episode_id,
        final_outcome: input.outcome,
        time_to_solve_ms,
        attempts,
        hints_used,
        skill_updates,
        xp_award: {
          amount: xpDecision.amount,
          reason: xpDecision.reason,
          awarded: xpResult.inserted,
        },
        plan_item_marked,
        reviews_written,
        due_concepts_count: dueCount,
      };
    },
  };
}

export function coldStartSkill(concept_id: string): ConceptSkill {
  return { concept_id, skill: 0.5, confidence: 0, attempts: 0 };
}

// STORY-034 — translate a grader rubric (1-5 ints) into a small skill bonus delta.
// Each dimension contributes (score - 3) / 2 * GRADER_BONUS_PER_DIMENSION; the dimensions are
// averaged so the total stays bounded. With GRADER_BONUS_PER_DIMENSION = 0.04, a perfect 5/5/5
// rubric adds +0.04 to skill, a 1/1/1 rubric subtracts -0.04, and a workmanlike 3/3/3 adds 0.
// The bonus is clamped to ±0.05 so a single rubric never dominates the EWMA's per-episode delta.
//
// Skipped when:
//   - the grader didn't run (rubric === null) → 0
//   - the grader fell back to neutral 3/3/3 (fallback_used=true) → 0
//   - the user didn't pass — rubric scores on a failing submission are advisory only (the
//     base EWMA already reflects the failure)
export const GRADER_BONUS_PER_DIMENSION = 0.04;
export const GRADER_BONUS_CLAMP = 0.05;

export function applyGraderBonus(args: {
  rubric: GraderAgentRubric | null | undefined;
  passed: boolean;
}): number {
  if (!args.passed) return 0;
  const r = args.rubric;
  if (!r) return 0;
  if (r.fallback_used) return 0;
  const dims = [r.rubric.idiomatic, r.rubric.efficiency, r.rubric.test_coverage_thinking];
  const meanDelta = dims.reduce((acc, n) => acc + (n - 3) / 2, 0) / dims.length;
  const bonus = meanDelta * GRADER_BONUS_PER_DIMENSION;
  if (bonus > GRADER_BONUS_CLAMP) return GRADER_BONUS_CLAMP;
  if (bonus < -GRADER_BONUS_CLAMP) return -GRADER_BONUS_CLAMP;
  return round6(bonus);
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}
