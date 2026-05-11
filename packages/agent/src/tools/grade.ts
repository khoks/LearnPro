import { z } from "zod";
import { SandboxWorkspaceFileSchema, type SandboxWorkspaceFile } from "@learnpro/sandbox";
import type {
  ComprehensionGradeDeps,
  GradeDeps,
  GradeRubric,
  GraderAgentRubric,
  HiddenTestResult,
} from "../ports.js";
import { ComprehensionAnswerSchema } from "../comprehension-grade.js";
import { EpisodeNotFoundError } from "./give-hint.js";

// STORY-038a / STORY-043a — submit body union. Implement/debug episodes ship code: either
// the legacy `{ code: string }` (single-file) OR the multi-file `{ files: [{path,content},...] }`
// (STORY-043a). Comprehension episodes ship `{ comprehension_answer }`. The grade tool
// dispatches on `episode.problem.kind`; mismatched shape throws GradeInputShapeMismatchError
// before reaching the sandbox / LLM.
export const GradeInputSchema = z.union([
  z.object({
    episode_id: z.string().uuid(),
    code: z.string().min(1),
  }),
  z.object({
    episode_id: z.string().uuid(),
    files: z.array(SandboxWorkspaceFileSchema).min(1).max(64),
  }),
  z.object({
    episode_id: z.string().uuid(),
    comprehension_answer: ComprehensionAnswerSchema,
  }),
]);
export type GradeInput = z.input<typeof GradeInputSchema>;

export const GradeRubricSchema = z.object({
  correctness: z.number().min(0).max(1),
  idiomatic: z.number().min(0).max(1),
  edge_case_coverage: z.number().min(0).max(1),
});

// STORY-034 — split critique/grader agent rubric. Surfaced on GradeOutput when the grader is
// wired so the tutor's commentary phase + the persisted episode row can both reference it.
export const GraderAgentRubricSchema = z.object({
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

// STORY-038a — comprehension grade verdict surfaced on the GradeOutput when
// `episode.problem.kind === "comprehension"`. Carries the deterministic verdict for
// multiple-choice, the LLM rubric verdict for free-text, and the problem's authored
// `explanation` so the tutor's commentary phase can quote it on a correct answer without a
// second prompt round-trip. `fallback_used` flips when the LLM grader produced no parsable
// verdict and the conservative "incorrect" fallback was used — surfaced so the UI can soften
// the message.
export const ComprehensionGradeOutputSchema = z.object({
  correct: z.boolean(),
  reasoning: z.string().min(1),
  explanation: z.string().min(1),
  fallback_used: z.boolean(),
});
export type ComprehensionGradeOutput = z.infer<typeof ComprehensionGradeOutputSchema>;

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
  // STORY-034 — null when the grader isn't wired (e.g. unit tests, the unified-tutor fallback,
  // or operator opt-out). Optional on construction so legacy fixtures don't need updating; the
  // tool always sets it (null or rubric) on the runtime path.
  grader: GraderAgentRubricSchema.nullable().optional(),
  // STORY-038a — comprehension verdict carried alongside the implement/debug rubric on a
  // comprehension episode. Null on implement/debug episodes (and on legacy fixtures pre-038a).
  comprehension: ComprehensionGradeOutputSchema.nullable().optional(),
});
export type GradeOutput = z.infer<typeof GradeOutputSchema>;

export interface GradeTool {
  readonly name: "grade";
  run(input: GradeInput): Promise<GradeOutput>;
}

export interface CreateGradeToolOptions {
  deps: GradeDeps;
  // STORY-038a — optional comprehension deps for the grade dispatch fan-out. When present, the
  // tool detects `episode.problem.kind === "comprehension"` and routes to this dep instead of
  // the implement/debug hidden-tests + rubric path. When omitted, comprehension episodes raise a
  // ComprehensionDepsNotWiredError so callers fail fast (don't silently drop the verdict).
  comprehensionDeps?: ComprehensionGradeDeps;
}

// STORY-038a — raised when a comprehension submission lands but the tool wasn't constructed
// with comprehension deps wired. The API layer maps this to a 503 so the user sees a clear
// "feature not configured" error rather than a generic 500.
export class ComprehensionDepsNotWiredError extends Error {
  constructor() {
    super("grade: comprehension deps not configured on this server");
    this.name = "ComprehensionDepsNotWiredError";
  }
}

// STORY-038a — raised when a comprehension submission omits `comprehension_answer` (or vice-
// versa for implement/debug). The API layer maps this to a 400 invalid-request.
export class GradeInputShapeMismatchError extends Error {
  constructor(message: string) {
    super(`grade: ${message}`);
    this.name = "GradeInputShapeMismatchError";
  }
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

      // STORY-038a — fan-out on `episode.problem.kind`. Comprehension episodes route to
      // `gradeComprehension` (deterministic for multiple-choice, LLM rubric for free-text); the
      // implement+debug branch keeps its existing hidden-tests-as-floor + grader-rubric path
      // intact.
      if (ctx.problem.kind === "comprehension") {
        if (!opts.comprehensionDeps) throw new ComprehensionDepsNotWiredError();
        if (!("comprehension_answer" in input)) {
          throw new GradeInputShapeMismatchError(
            "comprehension episode requires `comprehension_answer`, not `code` or `files`",
          );
        }
        const startC = Date.now();
        const comprehensionResult = await opts.comprehensionDeps.gradeComprehensionAnswer({
          episode_id: input.episode_id,
          user_id: ctx.user_id,
          problem: ctx.problem,
          answer: input.comprehension_answer,
        });
        const runtime_ms_c = Math.max(0, Date.now() - startC);
        // Persist the submission as a JSON-serialized answer so the audit trail / data export
        // round-trip the user's response. The implement+debug branch persists the user's source
        // code; we use the same column with a structured payload here.
        const code = JSON.stringify({
          kind: "comprehension_answer",
          answer: input.comprehension_answer,
        });
        const submission = await opts.deps.recordSubmission({
          episode_id: input.episode_id,
          user_id: ctx.user_id,
          org_id: ctx.org_id,
          code,
          passed: comprehensionResult.correct,
          runtime_ms: runtime_ms_c,
        });
        return {
          passed: comprehensionResult.correct,
          // No hidden tests on a comprehension episode.
          hidden_test_results: [],
          // Map the verdict onto a uniform rubric: correctness mirrors `correct`; idiomatic /
          // edge-case-coverage default to 0 (the comprehension axis lives separately on the
          // profile, not on this rubric).
          rubric: {
            correctness: comprehensionResult.correct ? 1 : 0,
            idiomatic: 0,
            edge_case_coverage: 0,
          },
          prose_explanation: comprehensionResult.reasoning,
          submission_id: submission.submission_id,
          runtime_ms: runtime_ms_c,
          grader: null,
          comprehension: {
            correct: comprehensionResult.correct,
            reasoning: comprehensionResult.reasoning,
            explanation: comprehensionResult.explanation,
            fallback_used: comprehensionResult.fallback_used,
          },
        };
      }

      if (!("code" in input) && !("files" in input)) {
        throw new GradeInputShapeMismatchError(
          "implement/debug episode requires `code` or `files`, not `comprehension_answer`",
        );
      }

      // STORY-043a — resolve the entry-file content + the optional auxiliary files. For the
      // legacy single-file shape we only have `code`. For the multi-file shape we have `files`
      // and pick the entry file by:
      //   1. The problem's authored `entry_file` when present.
      //   2. Otherwise the per-language convention (main.py / index.ts).
      // The grader rubric + the persisted submission row receive the entry file's content as
      // the canonical "user code" — the rubric LLM doesn't need to see the auxiliary files;
      // the audit trail records exactly what was submitted as the solver-under-test.
      const multiFileSubmission = "files" in input ? input.files : null;
      const entryPath = resolveEntryPath(ctx.problem, multiFileSubmission);
      const entryContent = resolveEntryContent(input, multiFileSubmission, entryPath);
      if (entryContent === null) {
        throw new GradeInputShapeMismatchError(
          `multi-file submission missing entry file '${entryPath}'`,
        );
      }

      const start = Date.now();
      const runHiddenTestsArgs: {
        problem: typeof ctx.problem;
        user_code: string;
        user_files?: ReadonlyArray<SandboxWorkspaceFile>;
      } = {
        problem: ctx.problem,
        user_code: entryContent,
      };
      if (multiFileSubmission) runHiddenTestsArgs.user_files = multiFileSubmission;
      const test_results = await opts.deps.runHiddenTests(runHiddenTestsArgs);
      const runtime_ms = Math.max(0, Date.now() - start);
      const agg = aggregatePassed(test_results);

      // Even when the user passes everything, we still ask the LLM for the rubric — idiomatic-ness
      // and edge-case coverage are what differentiate a 1.0 from a 0.85 pass and the learner
      // should hear it.
      const { rubric, prose_explanation } = await opts.deps.generateRubric({
        user_id: ctx.user_id,
        problem: ctx.problem,
        user_code: entryContent,
        test_results,
      });

      // STORY-034 — split critique/grader agent. Runs AFTER tests-as-floor + AFTER the legacy
      // unified rubric (so an A/B comparison stays tractable: both rubrics persist for the same
      // submission). Best-effort: a grader hiccup falls through to `grader = null` and the
      // submission still records — never block the user on the grader.
      let grader: GraderAgentRubric | null = null;
      if (opts.deps.runGraderAgent) {
        try {
          grader = await opts.deps.runGraderAgent({
            episode_id: input.episode_id,
            user_id: ctx.user_id,
            org_id: ctx.org_id,
            problem: ctx.problem,
            user_code: entryContent,
            test_results,
          });
        } catch {
          grader = null;
        }
      }
      if (grader && opts.deps.persistGraderRubric) {
        try {
          await opts.deps.persistGraderRubric({
            episode_id: input.episode_id,
            rubric: grader,
          });
        } catch {
          // intentional: rubric persistence is best-effort; never fail the close.
        }
      }

      // STORY-043a — for multi-file submissions, persist the full workspace as a JSON blob
      // so the audit trail / data export round-trip the user's exact submission. Single-file
      // submissions persist the raw source string unchanged (no behavioural change).
      const persistedCode = multiFileSubmission
        ? JSON.stringify({
            kind: "multi_file_submission",
            entry_file: entryPath,
            files: multiFileSubmission.map((f) => ({ path: f.path, content: f.content })),
          })
        : entryContent;
      const submission = await opts.deps.recordSubmission({
        episode_id: input.episode_id,
        user_id: ctx.user_id,
        org_id: ctx.org_id,
        code: persistedCode,
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
        grader,
        comprehension: null,
      };
    },
  };
}

// STORY-043a — pick the entry-file path for a submission. Multi-file submissions honor the
// problem's authored `entry_file` when present; otherwise fall back to the per-language
// convention. Single-file submissions never read this helper.
function resolveEntryPath(
  problem: { language: "python" | "typescript"; entry_file?: string | null | undefined },
  _files: ReadonlyArray<SandboxWorkspaceFile> | null,
): string {
  const authored = problem.entry_file;
  if (authored) return authored;
  if (problem.language === "python") return "main.py";
  return "index.ts";
}

function resolveEntryContent(
  input: { code?: string; files?: ReadonlyArray<SandboxWorkspaceFile> },
  files: ReadonlyArray<SandboxWorkspaceFile> | null,
  entryPath: string,
): string | null {
  if (typeof input.code === "string") return input.code;
  if (!files) return null;
  const entry = files.find((f) => f.path === entryPath);
  return entry ? entry.content : null;
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
