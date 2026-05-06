import { z } from "zod";
import { createEmptyCard, fsrs, Rating, type Card } from "ts-fsrs";
import { FinalOutcomeSchema, type FinalOutcome } from "./xp-streak-types.js";

// STORY-031 — pure wrapper around `ts-fsrs` (FSRS-5). Lives here so @learnpro/scoring stays the
// home of every adaptive policy (matches `streak-policy.ts` / `xp-policy.ts`). The DB layer in
// @learnpro/db/concept-reviews.ts is the only place this meets a connection.
//
// The library's own `Card` shape carries `state` (New/Learning/Review/Relearning), `reps`,
// `scheduled_days`, `learning_steps`, etc. We persist only the fields the platform actually
// reasons about — `stability`, `difficulty`, `due`, `lapses`, `last_reviewed` — and rebuild the
// rest from the algorithm's defaults on each recompute. This keeps the jsonb shape stable across
// ts-fsrs minor versions (we follow ts-fsrs, not Anki).

export const FsrsGradeSchema = z.enum(["again", "hard", "good", "easy"]);
export type FsrsGrade = z.infer<typeof FsrsGradeSchema>;

// FSRS-5 difficulty is bounded [1, 10] for graded cards, but `createEmptyCard()` initializes a
// card with difficulty=0 (a sentinel meaning "no graded review yet"). We accept the [0, 10] range
// here so the cold-start state round-trips through Zod cleanly.
export const FsrsCardStateSchema = z.object({
  stability: z.number().nonnegative(),
  difficulty: z.number().min(0).max(10),
  // ISO-8601 timestamp. Stored as a string in jsonb; the client + DB helpers parse on read.
  due: z.string().datetime(),
  lapses: z.number().int().min(0),
  // Null on a freshly-initialized cold-start card. Otherwise an ISO-8601 timestamp of the most
  // recent review.
  last_reviewed: z.string().datetime().nullable(),
});
export type FsrsCardState = z.infer<typeof FsrsCardStateSchema>;

// Cold-start state: due immediately so the first review schedules a real FSRS interval. The
// initial difficulty/stability come from `createEmptyCard`. We don't expose ts-fsrs's `New`-state
// internals because they leak across versions.
export function initialCardState(now: Date = new Date()): FsrsCardState {
  const card = createEmptyCard(now);
  return {
    stability: card.stability,
    difficulty: card.difficulty,
    due: card.due.toISOString(),
    lapses: card.lapses,
    last_reviewed: null,
  };
}

export interface RecomputeAfterReviewInput {
  state: FsrsCardState;
  grade: FsrsGrade;
  now: Date;
}

// Produces a fresh `FsrsCardState` after grading a single review. Pure — no DB. The `ts-fsrs`
// scheduler is invoked with our trimmed state hydrated into a full Card; we then strip back to
// the persisted projection.
export function recomputeAfterReview(input: RecomputeAfterReviewInput): FsrsCardState {
  const scheduler = fsrs();
  const card = hydrateCard(input.state);
  const result = scheduler.next(card, input.now, ratingFor(input.grade));
  const next = result.card;
  return {
    stability: next.stability,
    difficulty: next.difficulty,
    due: next.due.toISOString(),
    lapses: next.lapses,
    last_reviewed: input.now.toISOString(),
  };
}

export interface IsDueInput {
  state: FsrsCardState;
  now: Date;
}

// True when the card's due timestamp is at or before `now`. A freshly-initialized cold-start
// card is due immediately (so first-touch scheduling kicks off).
export function isDue(input: IsDueInput): boolean {
  return new Date(input.state.due).getTime() <= input.now.getTime();
}

export interface MapEpisodeOutcomeToGradeInput {
  outcome: FinalOutcome;
  hints_used: number;
  // Optional: when supplied, a `passed` outcome that came in noticeably under the expected median
  // is upgraded to `easy`. The threshold is a multiplier on `expected_median_time_to_solve_ms`
  // (default 0.6 — i.e., user took < 60% of expected). When omitted, `passed` always maps to
  // `good` (the safer default — the assigner doesn't always have time data).
  time_to_solve_ms?: number;
  expected_time_ms?: number;
  // Multiplier; values <= 1 narrow the under-target band. Defaults to 0.6.
  under_target_multiplier?: number;
}

export const MapEpisodeOutcomeToGradeInputSchema = z.object({
  outcome: FinalOutcomeSchema,
  hints_used: z.number().int().min(0),
  time_to_solve_ms: z.number().int().nonnegative().optional(),
  expected_time_ms: z.number().int().positive().optional(),
  under_target_multiplier: z.number().positive().max(1).optional(),
});

// Translates the episode-close signal into an FSRS grade. The mapping is opinionated and
// documented in STORY-031:
//   - `revealed`              -> again  (the learner gave up + asked for the answer)
//   - `failed`                -> again  (no passing submission)
//   - `abandoned`             -> again  (closed without finishing — stability should erode)
//   - `passed_with_hints`     -> hard if 2+ hints, good if exactly 1 hint
//   - `passed`                -> easy if 0 hints + under-target time, otherwise good
// The `under-target` window guards against gaming with stalls; we only upgrade a clean pass.
export function mapEpisodeOutcomeToGrade(input: MapEpisodeOutcomeToGradeInput): FsrsGrade {
  switch (input.outcome) {
    case "revealed":
    case "failed":
    case "abandoned":
      return "again";
    case "passed_with_hints":
      return input.hints_used >= 2 ? "hard" : "good";
    case "passed": {
      if (input.hints_used > 0) return "good";
      if (input.time_to_solve_ms === undefined || input.expected_time_ms === undefined) {
        return "good";
      }
      const multiplier = input.under_target_multiplier ?? 0.6;
      const threshold = input.expected_time_ms * multiplier;
      return input.time_to_solve_ms <= threshold ? "easy" : "good";
    }
  }
}

// Rebuilds a full `Card` from our trimmed state. ts-fsrs's `next()` reads `state`, `reps`,
// `scheduled_days`, `learning_steps`, `elapsed_days` — fields we don't persist. Cold-start cards
// (lapses=0, last_reviewed=null) are rebuilt via `createEmptyCard` and only their stability /
// difficulty are overridden — that produces the algorithm-correct initial scheduling on the
// first review while still respecting any persisted drift.
function hydrateCard(state: FsrsCardState): Card {
  if (state.last_reviewed === null) {
    const seeded = createEmptyCard(new Date(state.due));
    seeded.stability = state.stability;
    seeded.difficulty = state.difficulty;
    seeded.due = new Date(state.due);
    seeded.lapses = state.lapses;
    return seeded;
  }
  // Post-cold-start cards start from a Review-state card so `next()` schedules them via the
  // long-term branch (not the learning-steps branch). `reps` is reconstructed conservatively
  // from `lapses + 1` so the algorithm doesn't treat the card as brand-new — accuracy here
  // doesn't affect the next stability since `next()` only reads `stability` / `difficulty` /
  // `last_review` / `due` for the Review-branch math.
  const lastReviewed = new Date(state.last_reviewed);
  const reps = Math.max(1, state.lapses + 1);
  return {
    due: new Date(state.due),
    stability: state.stability,
    difficulty: state.difficulty,
    elapsed_days: 0,
    scheduled_days: 0,
    learning_steps: 0,
    reps,
    lapses: state.lapses,
    state: 2,
    last_review: lastReviewed,
  };
}

function ratingFor(grade: FsrsGrade): Rating.Again | Rating.Hard | Rating.Good | Rating.Easy {
  switch (grade) {
    case "again":
      return Rating.Again;
    case "hard":
      return Rating.Hard;
    case "good":
      return Rating.Good;
    case "easy":
      return Rating.Easy;
  }
}
