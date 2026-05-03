import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import {
  TutorSession,
  createAssignProblemTool,
  createGiveHintTool,
  createGradeTool,
  createUpdateProfileTool,
  type AssignProblemDeps,
  type GiveHintDeps,
  type GradeDeps,
  type HiddenTestResult,
  type ProblemCatalogEntry,
  type RecentEpisode,
  type TutorState,
  type UpdateProfileDeps,
  type UpdateProfileEpisodeContext,
} from "@learnpro/agent";
import {
  agent_calls,
  concepts,
  episodes,
  problems,
  skill_scores,
  submissions,
  tracks,
  type LearnProDb,
} from "@learnpro/db";
import {
  ANTHROPIC_HAIKU,
  ANTHROPIC_OPUS,
  type LLMProvider,
} from "@learnpro/llm";
import {
  ProblemDefSchema,
  buildHarnessForProblem,
  loadProblems,
  parseVerdict,
  type ProblemDef,
} from "@learnpro/problems";
import {
  GRADE_PROMPT_VERSION_TAG,
  TUTOR_PROMPT_VERSION,
  buildGradeSystemPrompt,
  buildGradeUserPrompt,
  buildHintSystemPrompt,
  buildHintUserPrompt,
} from "@learnpro/prompts";
import type { SandboxProvider } from "@learnpro/sandbox";
import type { TutorAgentFactory } from "./tutor.js";
import type { ConceptSkill } from "@learnpro/scoring";
import type { TutorSessionTools } from "@learnpro/agent";

// Default Drizzle/LLM-backed factory. Constructed once at server-boot, called per HTTP request to
// build a fresh TutorSession + tools tuple.
//
// Each tool's `agent_calls` write is the LLM provider's responsibility — its `LLMTelemetrySink`
// is the same `DrizzleLLMTelemetrySink` from STORY-060 wired into the provider at boot. We
// don't write `agent_calls` rows directly in the factory.

export interface BuildDrizzleTutorFactoryOptions {
  db: LearnProDb;
  llm: LLMProvider;
  sandbox: SandboxProvider;
  // Optional override for the cached problems-on-disk catalog. Defaults to loadProblems().
  catalog_loader?: () => ProblemDef[];
}

export function buildDrizzleTutorFactory(
  opts: BuildDrizzleTutorFactoryOptions,
): TutorAgentFactory {
  const catalogCache = (opts.catalog_loader ?? loadProblems)();

  return {
    async createForAssign(input) {
      const tools = buildTools({
        ...opts,
        catalog: catalogCache,
        org_id: input.org_id,
      });
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
          hidden_tests: problems.hidden_tests,
        })
        .from(episodes)
        .innerJoin(problems, eq(episodes.problem_id, problems.id))
        .where(and(eq(episodes.id, input.episode_id), eq(episodes.user_id, input.user_id)))
        .limit(1);
      const row = episodeRow[0];
      if (!row) return null;

      const tools = buildTools({
        ...opts,
        catalog: catalogCache,
        org_id: input.org_id,
      });

      // Rehydrate state. If the episode is finished, present it as `done` (so further submits/hints
      // are rejected as illegal transitions). Otherwise we put it back in `coding` so the user can
      // submit another attempt.
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
            // Hints are tracked structurally on the server side — we can't recover prior hint
            // text from the DB without an extra table. The state machine only uses `hints.length`
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

interface BuildToolsOptions {
  db: LearnProDb;
  llm: LLMProvider;
  sandbox: SandboxProvider;
  catalog: ProblemDef[];
  org_id: string;
}

function buildTools(opts: BuildToolsOptions): TutorSessionTools {
  const assignProblem = createAssignProblemTool({
    deps: buildAssignProblemDeps(opts),
  });
  const giveHint = createGiveHintTool({ deps: buildGiveHintDeps(opts) });
  const grade = createGradeTool({ deps: buildGradeDeps(opts) });
  const updateProfile = createUpdateProfileTool({ deps: buildUpdateProfileDeps(opts) });
  return { assignProblem, giveHint, grade, updateProfile };
}

function buildAssignProblemDeps(opts: BuildToolsOptions): AssignProblemDeps {
  return {
    async loadRecentEpisodes(input) {
      const rows = await opts.db
        .select({
          problem_id: episodes.problem_id,
          problem_slug: problems.slug,
          started_at: episodes.started_at,
          finished_at: episodes.finished_at,
          hints_used: episodes.hints_used,
          attempts: episodes.attempts,
          final_outcome: episodes.final_outcome,
          time_to_solve_ms: episodes.time_to_solve_ms,
          difficulty_text: problems.difficulty,
          track_id: problems.track_id,
          hidden_tests: problems.hidden_tests,
        })
        .from(episodes)
        .innerJoin(problems, eq(episodes.problem_id, problems.id))
        .where(and(eq(episodes.user_id, input.user_id), eq(problems.track_id, input.track_id)))
        .orderBy(desc(episodes.started_at))
        .limit(input.limit);

      return rows.map((r): RecentEpisode => {
        const expected_time_ms = readExpectedTimeMs(r.hidden_tests) ?? 60_000;
        const passed = r.final_outcome === "passed" || r.final_outcome === "passed_with_hints";
        const reveal_clicked = r.final_outcome === "revealed";
        const submit_count = Math.max(1, r.attempts);
        const time_to_solve_ms = r.time_to_solve_ms ?? 0;
        const difficulty = textToTier(r.difficulty_text);
        const signal: RecentEpisode["signal"] = r.finished_at
          ? {
              passed,
              reveal_clicked,
              hints_used: r.hints_used,
              submit_count,
              time_to_solve_ms,
              expected_time_ms,
            }
          : null;
        return {
          problem_id: r.problem_id,
          problem_slug: r.problem_slug,
          started_at: r.started_at.getTime(),
          difficulty,
          signal,
          final_outcome: r.final_outcome,
        };
      });
    },
    async loadProblemCatalog(input) {
      const rows = await opts.db
        .select({ id: problems.id, slug: problems.slug })
        .from(problems)
        .where(eq(problems.track_id, input.track_id))
        .orderBy(asc(problems.slug));
      const idBySlug = new Map(rows.map((r) => [r.slug, r.id]));
      const out: ProblemCatalogEntry[] = [];
      for (const def of opts.catalog) {
        const id = idBySlug.get(def.slug);
        if (!id) continue;
        out.push({ problem_id: id, problem_slug: def.slug, def });
      }
      return out;
    },
    async createEpisode(input) {
      const inserted = await opts.db
        .insert(episodes)
        .values({
          org_id: input.org_id,
          user_id: input.user_id,
          problem_id: input.problem_id,
        })
        .returning({ id: episodes.id, started_at: episodes.started_at });
      const row = inserted[0];
      if (!row) throw new Error("episode insert returned no row");
      return { episode_id: row.id, started_at: row.started_at.getTime() };
    },
  };
}

function buildGiveHintDeps(opts: BuildToolsOptions): GiveHintDeps {
  return {
    async loadEpisodeProblem(input) {
      const ctx = await loadEpisodeProblemRow(opts.db, input.episode_id, opts.catalog);
      if (!ctx) return null;
      return {
        episode_id: ctx.episode_id,
        user_id: ctx.user_id,
        problem_id: ctx.problem_id,
        problem: ctx.problem,
        prior_hints: [],
      };
    },
    async generateHint(input) {
      const res = await opts.llm.complete({
        messages: [
          { role: "user", content: buildHintUserPrompt({
            rung: input.rung,
            problem_name: input.problem.name,
            problem_language: input.problem.language,
            problem_statement: input.problem.statement,
            starter_code: input.problem.starter_code,
            prior_hints: input.prior_hints.map((h) => ({ rung: h.rung, hint: h.hint })),
          }) },
        ],
        system: buildHintSystemPrompt(input.rung),
        model: ANTHROPIC_OPUS,
        role: "tutor",
        max_tokens: 600,
        temperature: 0.5,
        prompt_version: TUTOR_PROMPT_VERSION,
        user_id: input.user_id,
      });
      return { hint: res.text.trim() };
    },
    async incrementHintsUsed(input) {
      await opts.db
        .update(episodes)
        .set({ hints_used: sql`${episodes.hints_used} + 1` })
        .where(eq(episodes.id, input.episode_id));
    },
  };
}

function buildGradeDeps(opts: BuildToolsOptions): GradeDeps {
  return {
    async loadEpisodeProblem(input) {
      const ctx = await loadEpisodeProblemRow(opts.db, input.episode_id, opts.catalog);
      if (!ctx) return null;
      return ctx;
    },
    async runHiddenTests(input) {
      const out: HiddenTestResult[] = [];
      for (let i = 0; i < input.problem.hidden_tests.length; i += 1) {
        const test = input.problem.hidden_tests[i];
        if (!test) continue;
        const code = buildHarnessForProblem(input.problem, input.user_code, test);
        try {
          const res = await opts.sandbox.run({
            language: input.problem.language,
            code,
            time_limit_ms: 5_000,
            memory_limit_mb: 128,
            output_limit_bytes: 64 * 1024,
          });
          if (res.killed_by === "timeout") {
            out.push({ index: i, passed: false, detail: "timeout" });
            continue;
          }
          if (res.exit_code !== 0) {
            out.push({
              index: i,
              passed: false,
              detail: `exit_code=${res.exit_code} stderr=${res.stderr.slice(0, 200)}`,
            });
            continue;
          }
          const verdict = parseVerdict(res.stdout);
          if (verdict.ok) {
            out.push({ index: i, passed: true });
          } else {
            const result: HiddenTestResult = {
              index: i,
              passed: false,
              expected: test.expected,
            };
            if (verdict.detail !== undefined) result.detail = verdict.detail;
            if (verdict.got !== undefined) result.got = verdict.got;
            out.push(result);
          }
        } catch (err) {
          out.push({ index: i, passed: false, detail: `sandbox error: ${(err as Error).message}` });
        }
      }
      return out;
    },
    async generateRubric(input) {
      const failing = input.test_results
        .filter((r) => !r.passed)
        .slice(0, 3)
        .map((r) => `${r.detail ?? "mismatch"}; expected=${JSON.stringify(r.expected)} got=${JSON.stringify(r.got)}`);
      const passed_count = input.test_results.filter((r) => r.passed).length;
      const res = await opts.llm.complete({
        messages: [
          {
            role: "user",
            content: buildGradeUserPrompt({
              problem_name: input.problem.name,
              problem_language: input.problem.language,
              problem_statement: input.problem.statement,
              user_code: input.user_code,
              total_tests: input.test_results.length,
              passed_tests: passed_count,
              failing_test_summaries: failing,
            }),
          },
        ],
        system: buildGradeSystemPrompt(),
        model: ANTHROPIC_HAIKU,
        role: "grader",
        max_tokens: 500,
        temperature: 0.2,
        prompt_version: GRADE_PROMPT_VERSION_TAG,
        user_id: input.user_id,
      });
      const parsed = safeParseRubricJson(res.text);
      if (parsed) return parsed;
      // Fallback: synthesize a deterministic rubric from the test results so the user always
      // gets *some* feedback even if the LLM JSON failed.
      const correctness = input.test_results.length === 0
        ? 0
        : passed_count / input.test_results.length;
      return {
        rubric: {
          correctness,
          idiomatic: correctness >= 1 ? 0.7 : 0.5,
          edge_case_coverage: correctness,
        },
        prose_explanation: correctness >= 1
          ? "All hidden tests pass. (Detailed feedback unavailable — try again later.)"
          : `${passed_count}/${input.test_results.length} hidden tests pass. Inspect the failing cases.`,
      };
    },
    async recordSubmission(input) {
      const inserted = await opts.db
        .insert(submissions)
        .values({
          org_id: input.org_id,
          episode_id: input.episode_id,
          code: input.code,
          passed: input.passed,
          runtime_ms: input.runtime_ms,
        })
        .returning({ id: submissions.id });
      const row = inserted[0];
      if (!row) throw new Error("submission insert returned no row");
      // Bump the episode attempts counter so subsequent recent-episode queries see it.
      await opts.db
        .update(episodes)
        .set({ attempts: sql`${episodes.attempts} + 1` })
        .where(eq(episodes.id, input.episode_id));
      return { submission_id: row.id };
    },
  };
}

function buildUpdateProfileDeps(opts: BuildToolsOptions): UpdateProfileDeps {
  return {
    async loadEpisodeForClose(input) {
      const ctx = await loadEpisodeProblemRow(opts.db, input.episode_id, opts.catalog);
      if (!ctx) return null;
      const epRow = await opts.db
        .select({
          hints_used: episodes.hints_used,
          attempts: episodes.attempts,
          started_at: episodes.started_at,
          org_id: episodes.org_id,
        })
        .from(episodes)
        .where(eq(episodes.id, input.episode_id))
        .limit(1);
      const ep = epRow[0];
      if (!ep) return null;
      const out: UpdateProfileEpisodeContext = {
        episode_id: ctx.episode_id,
        user_id: ctx.user_id,
        org_id: ep.org_id,
        problem: ctx.problem,
        hints_used: ep.hints_used,
        attempts: ep.attempts,
        started_at: ep.started_at.getTime(),
      };
      return out;
    },
    async closeEpisode(input) {
      await opts.db
        .update(episodes)
        .set({
          finished_at: new Date(),
          final_outcome: input.final_outcome,
          time_to_solve_ms: input.time_to_solve_ms,
          attempts: input.attempts,
          hints_used: input.hints_used,
        })
        .where(eq(episodes.id, input.episode_id));
    },
    async upsertSkillScore(input) {
      // skill_scores table stores integer 0-100, but ConceptSkill is float 0-1. Scale.
      const scoreInt = Math.round(input.skill.skill * 100);
      const confidenceInt = Math.round(input.skill.confidence * 100);
      await opts.db
        .insert(skill_scores)
        .values({
          user_id: input.user_id,
          concept_id: input.concept_id,
          org_id: input.org_id,
          score: scoreInt,
          confidence: confidenceInt,
          last_practiced_at: new Date(),
        })
        .onConflictDoUpdate({
          target: [skill_scores.user_id, skill_scores.concept_id],
          set: {
            score: scoreInt,
            confidence: confidenceInt,
            last_practiced_at: new Date(),
          },
        });
    },
    async resolveConceptIds(input) {
      if (input.slugs.length === 0) return new Map();
      const rows = await opts.db
        .select({ id: concepts.id, slug: concepts.slug })
        .from(concepts)
        .where(
          and(
            eq(concepts.org_id, input.org_id),
            eq(concepts.language, input.language),
            inArray(concepts.slug, input.slugs),
          ),
        );
      return new Map(rows.map((r) => [r.slug, r.id]));
    },
    async loadSkillScore(input) {
      const rows = await opts.db
        .select({ score: skill_scores.score, confidence: skill_scores.confidence })
        .from(skill_scores)
        .where(
          and(
            eq(skill_scores.user_id, input.user_id),
            eq(skill_scores.concept_id, input.concept_id),
          ),
        )
        .limit(1);
      const r = rows[0];
      if (!r) return null;
      const score: ConceptSkill = {
        concept_id: input.concept_id,
        skill: r.score / 100,
        confidence: r.confidence / 100,
        attempts: 0, // skill_scores doesn't carry attempts yet — fine; updateSkillScore() bumps from this baseline.
      };
      return score;
    },
  };
}

interface EpisodeProblemRow {
  episode_id: string;
  user_id: string;
  org_id: string;
  problem_id: string;
  problem: ProblemDef;
}

async function loadEpisodeProblemRow(
  db: LearnProDb,
  episode_id: string,
  catalog: ProblemDef[],
): Promise<EpisodeProblemRow | null> {
  const row = await db
    .select({
      episode_id: episodes.id,
      user_id: episodes.user_id,
      org_id: episodes.org_id,
      problem_id: problems.id,
      problem_slug: problems.slug,
      problem_name: problems.name,
      problem_language: problems.language,
      problem_difficulty: problems.difficulty,
      problem_statement: problems.statement,
      problem_starter_code: problems.starter_code,
      problem_hidden_tests: problems.hidden_tests,
      track_slug: tracks.slug,
    })
    .from(episodes)
    .innerJoin(problems, eq(episodes.problem_id, problems.id))
    .innerJoin(tracks, eq(problems.track_id, tracks.id))
    .where(eq(episodes.id, episode_id))
    .limit(1);
  const r = row[0];
  if (!r) return null;

  const def = problemDefFromRow(r, catalog);
  return {
    episode_id: r.episode_id,
    user_id: r.user_id,
    org_id: r.org_id,
    problem_id: r.problem_id,
    problem: def,
  };
}

function problemDefFromRow(
  row: {
    problem_slug: string;
    problem_name: string;
    problem_language: "python" | "typescript";
    problem_difficulty: string;
    problem_statement: string;
    problem_starter_code: string | null;
    problem_hidden_tests: unknown;
    track_slug: string;
  },
  catalog: ProblemDef[],
): ProblemDef {
  // Prefer the on-disk YAML def (carries reference_solution + concept_tags + expected median).
  const def = catalog.find((c) => c.slug === row.problem_slug);
  if (def) return def;

  // Fallback: synthesize from the DB row when the slug isn't in the on-disk catalog (e.g.
  // demo-seeded "two-sum"). hidden_tests JSONB is `{ cases, public_examples?, reference_solution?,
  // concept_tags?, expected_median_time_to_solve_ms? }` from the seedProblems() shape.
  const ht = row.problem_hidden_tests as
    | {
        cases?: Array<{ input: unknown; expected: unknown; weight?: number }>;
        public_examples?: Array<{ input: unknown; expected: unknown }>;
        reference_solution?: string;
        concept_tags?: string[];
        expected_median_time_to_solve_ms?: number;
      }
    | null;
  const cases = ht?.cases ?? [];
  const synth = {
    slug: row.problem_slug,
    name: row.problem_name,
    language: row.problem_language,
    difficulty: difficultyTextToInt(row.problem_difficulty),
    track: row.track_slug,
    concept_tags: ht?.concept_tags ?? ["fundamentals"],
    statement: row.problem_statement,
    starter_code: row.problem_starter_code ?? "",
    reference_solution: ht?.reference_solution ?? row.problem_starter_code ?? "",
    public_examples: ht?.public_examples?.length
      ? ht.public_examples
      : cases.length > 0 && cases[0]
        ? [cases[0]]
        : [{ input: null, expected: null }],
    hidden_tests: cases.length > 0 ? cases : [{ input: null, expected: null }],
    expected_median_time_to_solve_ms: ht?.expected_median_time_to_solve_ms ?? 300_000,
  };
  return ProblemDefSchema.parse(synth);
}

function difficultyTextToInt(text: string): 1 | 2 | 3 | 4 | 5 {
  const n = Number(text);
  if (Number.isInteger(n) && n >= 1 && n <= 5) return n as 1 | 2 | 3 | 4 | 5;
  switch (text) {
    case "easy":
      return 2;
    case "medium":
      return 3;
    case "hard":
      return 4;
    case "expert":
      return 5;
    default:
      return 3;
  }
}

function textToTier(text: string): "easy" | "medium" | "hard" | "expert" | null {
  if (text === "easy" || text === "medium" || text === "hard" || text === "expert") return text;
  const n = Number(text);
  if (n <= 2) return "easy";
  if (n === 3) return "medium";
  if (n === 4) return "hard";
  if (n >= 5) return "expert";
  return null;
}

function readExpectedTimeMs(hidden_tests: unknown): number | null {
  if (!hidden_tests || typeof hidden_tests !== "object") return null;
  const t = (hidden_tests as { expected_median_time_to_solve_ms?: unknown })
    .expected_median_time_to_solve_ms;
  if (typeof t === "number" && t > 0) return t;
  return null;
}

function safeParseRubricJson(text: string): {
  rubric: { correctness: number; idiomatic: number; edge_case_coverage: number };
  prose_explanation: string;
} | null {
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  const rubricRaw = obj["rubric"];
  const proseRaw = obj["prose_explanation"];
  if (!rubricRaw || typeof rubricRaw !== "object") return null;
  if (typeof proseRaw !== "string") return null;
  const r = rubricRaw as Record<string, unknown>;
  const correctness = numOrZero(r["correctness"]);
  const idiomatic = numOrZero(r["idiomatic"]);
  const edge_case_coverage = numOrZero(r["edge_case_coverage"]);
  return {
    rubric: {
      correctness: clamp01(correctness),
      idiomatic: clamp01(idiomatic),
      edge_case_coverage: clamp01(edge_case_coverage),
    },
    prose_explanation: proseRaw.trim(),
  };
}

function numOrZero(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

// Records `agent_calls` are taken care of by the LLM provider's telemetry sink. Surface a no-op
// for the legacy import path.
export function noopAgentCallSink(): void {
  // intentional
}

// Re-export for callers wiring this up.
export { agent_calls };
