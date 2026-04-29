import type { SandboxProvider, SandboxRunResponse } from "@learnpro/sandbox";
import type { HiddenTest, ProblemDef } from "./schema.js";

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
    const code = buildHarness(def, test);
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

const VERDICT_PASS_TOKEN = "__LEARNPRO_PASS__";
const VERDICT_FAIL_TOKEN = "__LEARNPRO_FAIL__";

interface Verdict {
  ok: boolean;
  detail?: string;
  got?: unknown;
}

function parseVerdict(stdout: string): Verdict {
  const lines = stdout.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (!line) continue;
    if (line.startsWith(VERDICT_PASS_TOKEN)) return { ok: true };
    if (line.startsWith(VERDICT_FAIL_TOKEN)) {
      const payload = line.slice(VERDICT_FAIL_TOKEN.length).trim();
      try {
        const parsed = JSON.parse(payload) as { detail?: string; got?: unknown };
        return { ok: false, detail: parsed.detail, got: parsed.got };
      } catch {
        return { ok: false, detail: payload };
      }
    }
  }
  return { ok: false, detail: "no verdict line emitted by harness" };
}

function buildHarness(def: ProblemDef, test: HiddenTest): string {
  if (def.language === "python") {
    return buildPythonHarness(def, test);
  }
  return buildTypeScriptHarness(def, test);
}

function buildPythonHarness(def: ProblemDef, test: HiddenTest): string {
  const inputJson = JSON.stringify(test.input);
  const expectedJson = JSON.stringify(test.expected);
  return `${def.reference_solution}

import json as _json

_input = _json.loads(${pyRepr(inputJson)})
_expected = _json.loads(${pyRepr(expectedJson)})

def _normalize(v):
    if isinstance(v, list):
        return [_normalize(x) for x in v]
    if isinstance(v, dict):
        return {k: _normalize(v[k]) for k in sorted(v.keys())}
    return v

try:
    if isinstance(_input, list):
        _got = solve(*_input)
    else:
        _got = solve(_input)
except Exception as _e:
    print("${VERDICT_FAIL_TOKEN}" + _json.dumps({"detail": "solve raised: " + repr(_e)}))
else:
    if _normalize(_got) == _normalize(_expected):
        print("${VERDICT_PASS_TOKEN}")
    else:
        print("${VERDICT_FAIL_TOKEN}" + _json.dumps({"detail": "mismatch", "got": _got}, default=str))
`;
}

function buildTypeScriptHarness(def: ProblemDef, test: HiddenTest): string {
  const inputJson = JSON.stringify(test.input);
  const expectedJson = JSON.stringify(test.expected);
  return `${def.reference_solution}

const _input: unknown = JSON.parse(${tsStringLit(inputJson)});
const _expected: unknown = JSON.parse(${tsStringLit(expectedJson)});

function _normalize(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(_normalize);
  if (v && typeof v === "object") {
    const o: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      o[k] = _normalize((v as Record<string, unknown>)[k]);
    }
    return o;
  }
  return v;
}

try {
  const _got = Array.isArray(_input)
    ? (solve as (...args: unknown[]) => unknown)(...(_input as unknown[]))
    : (solve as (x: unknown) => unknown)(_input);
  if (JSON.stringify(_normalize(_got)) === JSON.stringify(_normalize(_expected))) {
    console.log("${VERDICT_PASS_TOKEN}");
  } else {
    console.log("${VERDICT_FAIL_TOKEN}" + JSON.stringify({ detail: "mismatch", got: _got }));
  }
} catch (e) {
  const msg = (e as Error).message ?? String(e);
  console.log("${VERDICT_FAIL_TOKEN}" + JSON.stringify({ detail: "solve threw: " + msg }));
}
`;
}

function pyRepr(s: string): string {
  return JSON.stringify(s);
}

function tsStringLit(s: string): string {
  return JSON.stringify(s);
}
