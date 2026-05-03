import type { SandboxProvider, SandboxRunResponse } from "@learnpro/sandbox";
import { buildHarnessForProblem, parseVerdict } from "./harness.js";
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
  for (let i = 0; i < def.hidden_tests.length; i += 1) {
    const test = def.hidden_tests[i];
    if (!test) continue;
    const code = buildHarnessForProblem(def, def.reference_solution, test);
    let res: SandboxRunResponse;
    try {
      res = await sandbox.run({
        language: def.language,
        code,
        time_limit_ms: opts.time_limit_ms ?? 5_000,
        memory_limit_mb: 128,
        output_limit_bytes: 64 * 1024,
      });
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

