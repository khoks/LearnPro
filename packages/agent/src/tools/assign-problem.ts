import { z } from "zod";
import {
  DEFAULT_DIFFICULTY_HEURISTIC,
  TIER_ORDER,
  nextDifficulty,
  type DifficultyHeuristicConfig,
} from "@learnpro/scoring";
import type { DifficultyTier } from "@learnpro/scoring";
import type { ProblemDef } from "@learnpro/problems";
import type { AssignProblemDeps, ProblemCatalogEntry, RecentEpisode } from "../ports.js";
import { difficultyToTier } from "../state.js";

export const AssignProblemInputSchema = z.object({
  user_id: z.string().uuid(),
  org_id: z.string(),
  track_id: z.string().uuid(),
  // Number of recent episodes to consider both for difficulty inference and the "not solved
  // recently" recency filter.
  recent_window: z.number().int().positive().max(50).default(10),
});
export type AssignProblemInput = z.input<typeof AssignProblemInputSchema>;

export const AssignProblemOutputSchema = z.object({
  episode_id: z.string().uuid(),
  problem_id: z.string().uuid(),
  problem_slug: z.string(),
  problem: z.object({
    name: z.string(),
    language: z.enum(["python", "typescript"]),
    statement: z.string(),
    starter_code: z.string(),
    public_examples: z.array(z.unknown()),
    expected_median_time_to_solve_ms: z.number().int().positive(),
    concept_tags: z.array(z.string()),
    difficulty: z.number().int().min(1).max(5),
  }),
  difficulty_tier: z.enum(["easy", "medium", "hard", "expert"]),
  why_this_difficulty: z.string(),
  started_at: z.number().int().nonnegative(),
});
export type AssignProblemOutput = z.infer<typeof AssignProblemOutputSchema>;

export interface AssignProblemTool {
  readonly name: "assignProblem";
  run(input: AssignProblemInput): Promise<AssignProblemOutput>;
}

export interface CreateAssignProblemToolOptions {
  deps: AssignProblemDeps;
  difficulty_config?: DifficultyHeuristicConfig;
  // Default starting difficulty when there is no episode history at all.
  cold_start_tier?: DifficultyTier;
}

export class NoEligibleProblemError extends Error {
  readonly tier: DifficultyTier;
  readonly track_id: string;

  constructor(tier: DifficultyTier, track_id: string) {
    super(
      `no eligible problem found in track ${track_id} at difficulty=${tier} (after recency filter)`,
    );
    this.name = "NoEligibleProblemError";
    this.tier = tier;
    this.track_id = track_id;
  }
}

export function createAssignProblemTool(opts: CreateAssignProblemToolOptions): AssignProblemTool {
  const config = opts.difficulty_config ?? DEFAULT_DIFFICULTY_HEURISTIC;
  const coldStart: DifficultyTier = opts.cold_start_tier ?? "easy";

  return {
    name: "assignProblem",
    async run(rawInput) {
      const input = AssignProblemInputSchema.parse(rawInput);
      const recent = await opts.deps.loadRecentEpisodes({
        user_id: input.user_id,
        track_id: input.track_id,
        limit: input.recent_window,
      });
      const catalog = await opts.deps.loadProblemCatalog({ track_id: input.track_id });
      if (catalog.length === 0) {
        throw new NoEligibleProblemError(coldStart, input.track_id);
      }

      const { tier, rationale } = pickDifficultyTier({
        recent,
        config,
        cold_start: coldStart,
      });
      const candidate = pickCandidate({ tier, recent, catalog });
      if (!candidate) {
        throw new NoEligibleProblemError(tier, input.track_id);
      }

      const created = await opts.deps.createEpisode({
        user_id: input.user_id,
        org_id: input.org_id,
        problem_id: candidate.problem_id,
      });

      return {
        episode_id: created.episode_id,
        problem_id: candidate.problem_id,
        problem_slug: candidate.problem_slug,
        problem: projectProblem(candidate.def),
        difficulty_tier: tier,
        why_this_difficulty: rationale,
        started_at: created.started_at,
      };
    },
  };
}

interface DifficultyPick {
  tier: DifficultyTier;
  rationale: string;
}

// Step difficulty using the most-recent eligible episode signal. Cold-start (no prior signal)
// returns the configured tier with a "cold-start" rationale.
export function pickDifficultyTier(opts: {
  recent: RecentEpisode[];
  config: DifficultyHeuristicConfig;
  cold_start: DifficultyTier;
}): DifficultyPick {
  const lastWithSignal = opts.recent.find(
    (e): e is RecentEpisode & { signal: NonNullable<RecentEpisode["signal"]> } =>
      e.signal !== null && e.difficulty !== null,
  );
  if (!lastWithSignal) {
    return {
      tier: opts.cold_start,
      rationale: `cold-start: no prior episodes — starting at ${opts.cold_start}`,
    };
  }
  const lastTier = lastWithSignal.difficulty;
  if (lastTier === null) {
    // Unreachable per the find-predicate above, but appeases the type narrower.
    return {
      tier: opts.cold_start,
      rationale: `cold-start: no prior episodes — starting at ${opts.cold_start}`,
    };
  }
  const tier = nextDifficulty(lastTier, lastWithSignal.signal, opts.config);
  if (tier === lastTier) {
    return {
      tier,
      rationale: `last episode signal in-band — staying at ${tier}`,
    };
  }
  const direction =
    TIER_ORDER.indexOf(tier) > TIER_ORDER.indexOf(lastTier) ? "stepping up" : "stepping down";
  return {
    tier,
    rationale: `${direction} from ${lastTier} → ${tier} based on last episode (passed=${lastWithSignal.signal.passed}, hints=${lastWithSignal.signal.hints_used}, attempts=${lastWithSignal.signal.submit_count})`,
  };
}

// Filter the catalog to the chosen tier and skip problems the user solved in the recent window.
// Falls back to picking from the entire tier (ignoring recency) if recency would empty the bucket
// — better to repeat than to fail the assign.
export function pickCandidate(opts: {
  tier: DifficultyTier;
  recent: RecentEpisode[];
  catalog: ProblemCatalogEntry[];
}): ProblemCatalogEntry | null {
  const inTier = opts.catalog.filter((c) => difficultyToTier(c.def.difficulty) === opts.tier);
  if (inTier.length === 0) {
    // Tier empty — try adjacent tiers within the same difficulty ladder before giving up.
    const order = TIER_ORDER;
    const idx = order.indexOf(opts.tier);
    for (const offset of [1, -1, 2, -2, 3]) {
      const probe = order[idx + offset];
      if (!probe) continue;
      const fallback = opts.catalog.filter((c) => difficultyToTier(c.def.difficulty) === probe);
      if (fallback.length > 0) {
        return chooseOldest(fallback, opts.recent);
      }
    }
    return null;
  }
  return chooseOldest(inTier, opts.recent);
}

// "Oldest" = the candidate the user has not seen in their recent window, or — if all candidates
// were recent — the one whose last started_at is furthest back.
function chooseOldest(
  candidates: ProblemCatalogEntry[],
  recent: RecentEpisode[],
): ProblemCatalogEntry {
  const recentSet = new Set(recent.map((r) => r.problem_id));
  const fresh = candidates.filter((c) => !recentSet.has(c.problem_id));
  if (fresh.length > 0) {
    // Stable: deterministic on slug ordering so tests pass without a tie-breaker dance.
    return fresh.sort((a, b) => a.problem_slug.localeCompare(b.problem_slug))[0]!;
  }
  // All seen recently — pick the one furthest in the past.
  const lastSeenAt = new Map<string, number>();
  for (const r of recent) lastSeenAt.set(r.problem_id, r.started_at);
  return candidates.sort((a, b) => {
    const aSeen = lastSeenAt.get(a.problem_id) ?? 0;
    const bSeen = lastSeenAt.get(b.problem_id) ?? 0;
    if (aSeen !== bSeen) return aSeen - bSeen;
    return a.problem_slug.localeCompare(b.problem_slug);
  })[0]!;
}

function projectProblem(def: ProblemDef): AssignProblemOutput["problem"] {
  return {
    name: def.name,
    language: def.language,
    statement: def.statement,
    starter_code: def.starter_code,
    public_examples: def.public_examples,
    expected_median_time_to_solve_ms: def.expected_median_time_to_solve_ms,
    concept_tags: def.concept_tags,
    difficulty: def.difficulty,
  };
}
