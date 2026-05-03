import type { HiddenTest, ProblemDef } from "./schema.js";

// Per-language verdict harness shared by `validateProblems` (seed-bank smoke tests in
// @learnpro/problems) and the tutor agent's `grade` tool (in @learnpro/agent). The harness wraps
// USER OR REFERENCE solve() code together with one hidden test, runs it in the sandbox, and
// emits one of two verdict tokens that the caller parses out of stdout:
//   __LEARNPRO_PASS__              — solve() returned a value matching the expected output
//   __LEARNPRO_FAIL__{json}        — mismatch / threw / etc., with structured detail
//
// The two callers vary only in *whose* `solve()` definition gets stitched in:
// validateProblems uses def.reference_solution; the agent's `grade` uses the user's submission.

export const VERDICT_PASS_TOKEN = "__LEARNPRO_PASS__";
export const VERDICT_FAIL_TOKEN = "__LEARNPRO_FAIL__";

export interface Verdict {
  ok: boolean;
  detail?: string;
  got?: unknown;
}

export function parseVerdict(stdout: string): Verdict {
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

export interface BuildHarnessOptions {
  language: "python" | "typescript";
  // The solve() definition to inject — either def.reference_solution (validateProblems) or the
  // user's submission code (the agent's grade tool).
  solve_code: string;
  test: HiddenTest;
}

export function buildHarness(opts: BuildHarnessOptions): string {
  if (opts.language === "python") {
    return buildPythonHarness(opts.solve_code, opts.test);
  }
  return buildTypeScriptHarness(opts.solve_code, opts.test);
}

// Convenience: most callers already hold a ProblemDef + a solve string.
export function buildHarnessForProblem(
  def: ProblemDef,
  solve_code: string,
  test: HiddenTest,
): string {
  return buildHarness({ language: def.language, solve_code, test });
}

function buildPythonHarness(solve_code: string, test: HiddenTest): string {
  const inputJson = JSON.stringify(test.input);
  const expectedJson = JSON.stringify(test.expected);
  return `${solve_code}

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

function buildTypeScriptHarness(solve_code: string, test: HiddenTest): string {
  const inputJson = JSON.stringify(test.input);
  const expectedJson = JSON.stringify(test.expected);
  return `${solve_code}

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
