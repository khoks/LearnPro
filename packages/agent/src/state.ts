import { z } from "zod";

// Discriminated union for the tutor state machine. The legal transition graph is:
//
//   idle → assigned → coding → coding (request hint, get hint, transition stays in coding)
//                            → grading → profile_updated → done
//                                                       ↓
//                                                   (or assigned → coding for the next problem)
//   any state → abandoned (terminal, via finish({outcome:"abandoned"}))
//
// We keep the union narrow — only fields the next legal step needs are carried forward.

export const TutorPhaseSchema = z.enum([
  "idle",
  "assigned",
  "coding",
  "grading",
  "profile_updated",
  "done",
  "abandoned",
]);
export type TutorPhase = z.infer<typeof TutorPhaseSchema>;

export const HintRungSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);
export type HintRung = z.infer<typeof HintRungSchema>;

export const HintRecordSchema = z.object({
  rung: HintRungSchema,
  hint: z.string(),
  xp_cost: z.number().int().nonnegative(),
});
export type HintRecord = z.infer<typeof HintRecordSchema>;

export const FinalOutcomeSchema = z.enum([
  "passed",
  "passed_with_hints",
  "failed",
  "abandoned",
  "revealed",
]);
export type FinalOutcome = z.infer<typeof FinalOutcomeSchema>;

const BaseStateSchema = z.object({
  user_id: z.string().uuid(),
  org_id: z.string(),
  track_id: z.string().uuid(),
  episode_id: z.string().uuid().optional(),
  problem_id: z.string().uuid().optional(),
  problem_slug: z.string().optional(),
  started_at: z.number().int().nonnegative().optional(),
  hints: z.array(HintRecordSchema).default([]),
  attempts: z.number().int().nonnegative().default(0),
});

export const TutorStateSchema = z.discriminatedUnion("phase", [
  BaseStateSchema.extend({ phase: z.literal("idle") }),
  BaseStateSchema.extend({
    phase: z.literal("assigned"),
    episode_id: z.string().uuid(),
    problem_id: z.string().uuid(),
    problem_slug: z.string(),
    started_at: z.number().int().nonnegative(),
  }),
  BaseStateSchema.extend({
    phase: z.literal("coding"),
    episode_id: z.string().uuid(),
    problem_id: z.string().uuid(),
    problem_slug: z.string(),
    started_at: z.number().int().nonnegative(),
  }),
  BaseStateSchema.extend({
    phase: z.literal("grading"),
    episode_id: z.string().uuid(),
    problem_id: z.string().uuid(),
    problem_slug: z.string(),
    started_at: z.number().int().nonnegative(),
    last_passed: z.boolean(),
  }),
  BaseStateSchema.extend({
    phase: z.literal("profile_updated"),
    episode_id: z.string().uuid(),
    problem_id: z.string().uuid(),
    problem_slug: z.string(),
    started_at: z.number().int().nonnegative(),
    final_outcome: FinalOutcomeSchema,
    time_to_solve_ms: z.number().int().nonnegative(),
  }),
  BaseStateSchema.extend({
    phase: z.literal("done"),
    episode_id: z.string().uuid(),
    problem_id: z.string().uuid(),
    problem_slug: z.string(),
    final_outcome: FinalOutcomeSchema,
  }),
  BaseStateSchema.extend({
    phase: z.literal("abandoned"),
  }),
]);
export type TutorState = z.infer<typeof TutorStateSchema>;

export class IllegalTransitionError extends Error {
  readonly from: TutorPhase;
  readonly action: string;

  constructor(from: TutorPhase, action: string) {
    super(`illegal tutor transition: cannot ${action} from phase=${from}`);
    this.name = "IllegalTransitionError";
    this.from = from;
    this.action = action;
  }
}

// Turn an integer ProblemDef difficulty (1-5) into the DifficultyTier ladder used by scoring.
// 1-2 → easy, 3 → medium, 4 → hard, 5 → expert. The reverse mapping picks a representative
// integer for a tier (the floor) so seed banks at any granularity round-trip cleanly.
export function difficultyToTier(d: number): "easy" | "medium" | "hard" | "expert" {
  if (d <= 2) return "easy";
  if (d === 3) return "medium";
  if (d === 4) return "hard";
  return "expert";
}

export function tierIncludesDifficulty(
  tier: "easy" | "medium" | "hard" | "expert",
  d: number,
): boolean {
  return difficultyToTier(d) === tier;
}
