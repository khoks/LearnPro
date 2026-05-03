import { z } from "zod";
import type { GradeDeps, GradeRubric, HiddenTestResult } from "../ports.js";
import { EpisodeNotFoundError } from "./give-hint.js";

export const GradeInputSchema = z.object({
  episode_id: z.string().uuid(),
  code: z.string().min(1),
});
export type GradeInput = z.input<typeof GradeInputSchema>;

export const GradeRubricSchema = z.object({
  correctness: z.number().min(0).max(1),
  idiomatic: z.number().min(0).max(1),
  edge_case_coverage: z.number().min(0).max(1),
});

export const GradeOutputSchema = z.object({
  passed: z.boolean(),
  hidden_test_results: z.array(
    z.object({
      index: z.number().int().min(0),
      passed: z.boolean(),
      detail: z.string().optional(),
      expected: z.unknown().optional(),
      got: z.unknown().optional(),
    }),
  ),
  rubric: GradeRubricSchema,
  prose_explanation: z.string().min(1),
  submission_id: z.string().uuid(),
  runtime_ms: z.number().int().min(0),
});
export type GradeOutput = z.infer<typeof GradeOutputSchema>;

export interface GradeTool {
  readonly name: "grade";
  run(input: GradeInput): Promise<GradeOutput>;
}

export interface CreateGradeToolOptions {
  deps: GradeDeps;
}

export function summarizeFailingTests(results: ReadonlyArray<HiddenTestResult>): string[] {
  return results
    .filter((r) => !r.passed)
    .slice(0, 3)
    .map((r) => {
      const expected = JSON.stringify(r.expected);
      const got = JSON.stringify(r.got);
      const detail = r.detail ?? "mismatch";
      return `${detail}; expected=${truncate(expected, 200)} got=${truncate(got, 200)}`;
    });
}

export function aggregatePassed(results: ReadonlyArray<HiddenTestResult>): {
  passed: boolean;
  passed_count: number;
  total: number;
} {
  const total = results.length;
  const passed_count = results.filter((r) => r.passed).length;
  return { passed: total > 0 && passed_count === total, passed_count, total };
}

export function createGradeTool(opts: CreateGradeToolOptions): GradeTool {
  return {
    name: "grade",
    async run(rawInput) {
      const input = GradeInputSchema.parse(rawInput);
      const ctx = await opts.deps.loadEpisodeProblem({ episode_id: input.episode_id });
      if (!ctx) throw new EpisodeNotFoundError(input.episode_id);

      const start = Date.now();
      const test_results = await opts.deps.runHiddenTests({
        problem: ctx.problem,
        user_code: input.code,
      });
      const runtime_ms = Math.max(0, Date.now() - start);
      const agg = aggregatePassed(test_results);

      // Even when the user passes everything, we still ask the LLM for the rubric — idiomatic-ness
      // and edge-case coverage are what differentiate a 1.0 from a 0.85 pass and the learner
      // should hear it.
      const { rubric, prose_explanation } = await opts.deps.generateRubric({
        user_id: ctx.user_id,
        problem: ctx.problem,
        user_code: input.code,
        test_results,
      });

      const submission = await opts.deps.recordSubmission({
        episode_id: input.episode_id,
        user_id: ctx.user_id,
        org_id: ctx.org_id,
        code: input.code,
        passed: agg.passed,
        runtime_ms,
      });

      return {
        passed: agg.passed,
        hidden_test_results: test_results.map(toOutput),
        rubric,
        prose_explanation,
        submission_id: submission.submission_id,
        runtime_ms,
      };
    },
  };
}

function toOutput(r: HiddenTestResult): GradeOutput["hidden_test_results"][number] {
  const out: GradeOutput["hidden_test_results"][number] = {
    index: r.index,
    passed: r.passed,
  };
  if (r.detail !== undefined) out.detail = r.detail;
  if (r.expected !== undefined) out.expected = r.expected;
  if (r.got !== undefined) out.got = r.got;
  return out;
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

// Helper exposed for the state-machine driver / API layer.
export function clampRubric(r: Partial<GradeRubric>): GradeRubric {
  return {
    correctness: clamp01(r.correctness ?? 0),
    idiomatic: clamp01(r.idiomatic ?? 0),
    edge_case_coverage: clamp01(r.edge_case_coverage ?? 0),
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
