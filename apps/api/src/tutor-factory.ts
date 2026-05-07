import { and, eq } from "drizzle-orm";
import {
  TutorSession,
  buildAssignProblemDrizzleDeps,
  buildGiveHintDrizzleDeps,
  buildGradeDrizzleDeps,
  buildUpdateProfileDrizzleDeps,
  createAssignProblemTool,
  createGiveHintTool,
  createGradeTool,
  createUpdateProfileTool,
  type TutorSessionTools,
  type TutorState,
  type UpdateProfileDeps,
} from "@learnpro/agent";
import { episodes, getEpisodeGotHelp, problems, type LearnProDb } from "@learnpro/db";
import type { LLMProvider } from "@learnpro/llm";
import { loadProblems, type ProblemDef } from "@learnpro/problems";
import type { SandboxProvider } from "@learnpro/sandbox";
import type { TutorAgentFactory } from "./tutor.js";

// Default Drizzle/LLM-backed factory. Constructed once at server-boot, called per HTTP request to
// build a fresh TutorSession + tools tuple. The tool-building logic lives in @learnpro/agent's
// `drizzle-deps.ts` so packages/agent's integration test exercises the same wiring.

export interface BuildDrizzleTutorFactoryOptions {
  db: LearnProDb;
  llm: LLMProvider;
  sandbox: SandboxProvider;
  catalog_loader?: () => ProblemDef[];
}

export function buildDrizzleTutorFactory(opts: BuildDrizzleTutorFactoryOptions): TutorAgentFactory {
  const catalog = (opts.catalog_loader ?? loadProblems)();

  function makeTools(org_id: string): TutorSessionTools {
    const depsOpts = { db: opts.db, llm: opts.llm, sandbox: opts.sandbox, catalog, org_id };
    const baseUpdateDeps = buildUpdateProfileDrizzleDeps(depsOpts);
    return {
      assignProblem: createAssignProblemTool({ deps: buildAssignProblemDrizzleDeps(depsOpts) }),
      giveHint: createGiveHintTool({ deps: buildGiveHintDrizzleDeps(depsOpts) }),
      grade: createGradeTool({ deps: buildGradeDrizzleDeps(depsOpts) }),
      updateProfile: createUpdateProfileTool({
        deps: wrapWithGotHelpAwareSkillSkip(baseUpdateDeps, opts.db),
      }),
    };
  }

  return {
    async createForAssign(input) {
      const tools = makeTools(input.org_id);
      const session = new TutorSession({
        user_id: input.user_id,
        org_id: input.org_id,
        track_id: input.track_id,
        tools,
      });
      return { session, tools };
    },
    async createForExisting(input) {
      const episodeRow = await opts.db
        .select({
          id: episodes.id,
          user_id: episodes.user_id,
          problem_id: episodes.problem_id,
          started_at: episodes.started_at,
          finished_at: episodes.finished_at,
          hints_used: episodes.hints_used,
          attempts: episodes.attempts,
          final_outcome: episodes.final_outcome,
          track_id: problems.track_id,
          problem_slug: problems.slug,
        })
        .from(episodes)
        .innerJoin(problems, eq(episodes.problem_id, problems.id))
        .where(and(eq(episodes.id, input.episode_id), eq(episodes.user_id, input.user_id)))
        .limit(1);
      const row = episodeRow[0];
      if (!row) return null;

      const tools = makeTools(input.org_id);
      const state: TutorState = row.finished_at
        ? {
            phase: "done",
            user_id: input.user_id,
            org_id: input.org_id,
            track_id: row.track_id,
            episode_id: row.id,
            problem_id: row.problem_id,
            problem_slug: row.problem_slug,
            hints: [],
            attempts: row.attempts,
            final_outcome: row.final_outcome ?? "abandoned",
          }
        : {
            phase: "coding",
            user_id: input.user_id,
            org_id: input.org_id,
            track_id: row.track_id,
            episode_id: row.id,
            problem_id: row.problem_id,
            problem_slug: row.problem_slug,
            started_at: row.started_at.getTime(),
            // Hints are tracked structurally on the server side. We can't recover prior hint
            // text from the DB without an extra table; the state machine only uses `hints.length`
            // for derive-final-outcome, so we synthesize empty placeholders.
            hints: Array.from({ length: row.hints_used }, () => ({
              rung: 1 as const,
              hint: "(prior hint)",
              xp_cost: 0,
            })),
            attempts: row.attempts,
          };

      const session = new TutorSession({
        user_id: input.user_id,
        org_id: input.org_id,
        track_id: row.track_id,
        tools,
        initial_state: state,
      });
      return { session, tools };
    },
  };
}

// STORY-042 — wrap an `UpdateProfileDeps` so `upsertSkillScore` becomes a no-op for episodes
// flagged `got_help=true`. We can't reach inside the agent tool to thread `got_help` through the
// signal — that file is owned by another work-stream — so this wrapper achieves the same end-state
// at the deps-layer:
//
//   1. `loadEpisodeForClose` is wrapped to remember the episode's got_help flag in a closure.
//   2. `upsertSkillScore` checks the closure before issuing the DB write. When got_help=true,
//      the skill bump is silently skipped (the submission was still graded normally and XP still
//      awarded — anti-dark-pattern: never penalize, just don't reward).
//
// The closure lives for the duration of one `createForAssign` / `createForExisting` deps build,
// which matches one HTTP request. The DB read happens once per close (not per concept) so the
// per-call overhead is a single SELECT.
export function wrapWithGotHelpAwareSkillSkip(
  deps: UpdateProfileDeps,
  db: LearnProDb,
): UpdateProfileDeps {
  let cached_episode_id: string | null = null;
  let cached_got_help: boolean | null = null;

  return {
    ...deps,
    async loadEpisodeForClose(input) {
      cached_episode_id = input.episode_id;
      try {
        cached_got_help = await getEpisodeGotHelp(db, input.episode_id);
      } catch {
        cached_got_help = null;
      }
      return deps.loadEpisodeForClose(input);
    },
    async upsertSkillScore(input) {
      if (cached_got_help === true) return;
      return deps.upsertSkillScore(input);
    },
    async loadSkillScore(input) {
      // Pass-through; the skill_scores read is needed regardless so the output's prev_skill is
      // accurate (we surface the unchanged value when got_help short-circuits the upsert).
      return deps.loadSkillScore(input);
    },
    // Intentionally keep `cached_episode_id` referenced so a future enhancement (e.g. a multi-
    // episode batch close) can validate the cache key matches the current call.
    async closeEpisode(input) {
      void cached_episode_id;
      return deps.closeEpisode(input);
    },
  };
}
