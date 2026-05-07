import type { SandboxProvider, SandboxRunResponse } from "@learnpro/sandbox";
import {
  buildHarnessForProblem,
  buildMultiFileHarnessForProblem,
  parseVerdict,
} from "./harness.js";
import type { ProblemDef } from "./schema.js";

export interface ProblemValidationFailure {
  test_index: number;
  reason: "exit_code" | "stderr" | "output_mismatch" | "timeout" | "exception";
  detail: string;
  expected?: unknown;
  got?: unknown;
}

export interface ProblemValidationResult {
  slug: string;
  language: ProblemDef["language"];
  passed: boolean;
  failures: ProblemValidationFailure[];
}

export interface ValidateProblemsOptions {
  time_limit_ms?: number;
}

export async function validateProblems(
  defs: readonly ProblemDef[],
  sandbox: SandboxProvider,
  opts: ValidateProblemsOptions = {},
): Promise<ProblemValidationResult[]> {
  const out: ProblemValidationResult[] = [];
  for (const def of defs) {
    out.push(await validateProblem(def, sandbox, opts));
  }
  return out;
}

export async function validateProblem(
  def: ProblemDef,
  sandbox: SandboxProvider,
  opts: ValidateProblemsOptions = {},
): Promise<ProblemValidationResult> {
  const failures: ProblemValidationFailure[] = [];
  // STORY-038 — comprehension problems have no sandbox-runnable hidden_tests. The per-problem
  // sanity check is "the YAML parsed at all" — already enforced by the Zod schema upstream.
  if (def.kind === "comprehension") {
    return { slug: def.slug, language: def.language, passed: true, failures: [] };
  }
  for (let i = 0; i < def.hidden_tests.length; i += 1) {
    const test = def.hidden_tests[i];
    if (!test) continue;
    // STORY-043 — multi-file path takes precedence when the problem declares a
    // `starter_workspace`; the entry file's content is replaced with the harness, while
    // every other file ships verbatim.  Single-file problems take the legacy `code` path.
    const multi = buildMultiFileHarnessForProblem(def, def.reference_solution, test);
    let res: SandboxRunResponse;
    try {
      if (multi) {
        res = await sandbox.run({
          language: def.language,
          files: [
            { path: multi.entry_path, content: multi.entry_content },
            ...multi.auxiliary_files,
          ],
          entry_file: multi.entry_path,
          time_limit_ms: opts.time_limit_ms ?? 5_000,
          memory_limit_mb: 128,
          output_limit_bytes: 64 * 1024,
        });
      } else {
        const code = buildHarnessForProblem(def, def.reference_solution, test);
        res = await sandbox.run({
          language: def.language,
          code,
          time_limit_ms: opts.time_limit_ms ?? 5_000,
          memory_limit_mb: 128,
          output_limit_bytes: 64 * 1024,
        });
      }
    } catch (err) {
      failures.push({
        test_index: i,
        reason: "exception",
        detail: (err as Error).message,
      });
      continue;
    }
    if (res.killed_by === "timeout") {
      failures.push({ test_index: i, reason: "timeout", detail: "sandbox timed out" });
      continue;
    }
    if (res.exit_code !== 0) {
      failures.push({
        test_index: i,
        reason: "exit_code",
        detail: `exit_code=${res.exit_code} stderr=${res.stderr.slice(0, 400)}`,
      });
      continue;
    }
    const verdict = parseVerdict(res.stdout);
    if (!verdict.ok) {
      failures.push({
        test_index: i,
        reason: "output_mismatch",
        detail: verdict.detail ?? "expected/got mismatch",
        expected: test.expected,
        got: verdict.got,
      });
    }
  }
  return {
    slug: def.slug,
    language: def.language,
    passed: failures.length === 0,
    failures,
  };
}
