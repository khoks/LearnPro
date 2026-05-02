import { describe, expect, it } from "vitest";
import {
  PistonHttpTransport,
  PistonSandboxProvider,
  type SandboxProvider,
  type SandboxRunRequest,
  type SandboxRunResponse,
} from "@learnpro/sandbox";
import { loadProblems } from "./loader.js";
import { validateProblem, validateProblems } from "./validate.js";

const REQUIRE_PISTON = process.env["LEARNPRO_REQUIRE_PISTON"] === "1";
const PISTON_URL = process.env["PISTON_URL"] ?? "http://localhost:2000";

class StubPassingProvider implements SandboxProvider {
  readonly name = "stub-pass";
  readonly calls: SandboxRunRequest[] = [];

  async run(req: SandboxRunRequest): Promise<SandboxRunResponse> {
    this.calls.push(req);
    return Promise.resolve({
      stdout: "__LEARNPRO_PASS__\n",
      stderr: "",
      exit_code: 0,
      duration_ms: 12,
      killed_by: null,
      language: req.language,
    });
  }
}

class StubFailingProvider implements SandboxProvider {
  readonly name = "stub-fail";

  async run(req: SandboxRunRequest): Promise<SandboxRunResponse> {
    return Promise.resolve({
      stdout: "__LEARNPRO_FAIL__" + JSON.stringify({ detail: "mismatch", got: 0 }) + "\n",
      stderr: "",
      exit_code: 0,
      duration_ms: 12,
      killed_by: null,
      language: req.language,
    });
  }
}

class StubExitNonZeroProvider implements SandboxProvider {
  readonly name = "stub-exit";

  async run(req: SandboxRunRequest): Promise<SandboxRunResponse> {
    return Promise.resolve({
      stdout: "",
      stderr: "Traceback ...\nNameError: name 'solve' is not defined\n",
      exit_code: 1,
      duration_ms: 8,
      killed_by: null,
      language: req.language,
    });
  }
}

describe("validateProblems (unit, mock sandbox)", () => {
  const sample = loadProblems().slice(0, 3);

  it("collects pass results across all problems and tests when sandbox returns __LEARNPRO_PASS__", async () => {
    const sandbox = new StubPassingProvider();
    const results = await validateProblems(sample, sandbox);
    expect(results).toHaveLength(sample.length);
    for (const r of results) {
      expect(r.passed).toBe(true);
      expect(r.failures).toEqual([]);
    }
    const expectedCalls = sample.reduce((acc, p) => acc + p.hidden_tests.length, 0);
    expect(sandbox.calls.length).toBe(expectedCalls);
  });

  it("records output_mismatch failures when sandbox returns __LEARNPRO_FAIL__", async () => {
    const sandbox = new StubFailingProvider();
    const result = await validateProblem(sample[0]!, sandbox);
    expect(result.passed).toBe(false);
    expect(result.failures.length).toBe(sample[0]!.hidden_tests.length);
    for (const f of result.failures) {
      expect(f.reason).toBe("output_mismatch");
    }
  });

  it("records exit_code failures when sandbox returns non-zero exit", async () => {
    const sandbox = new StubExitNonZeroProvider();
    const result = await validateProblem(sample[0]!, sandbox);
    expect(result.passed).toBe(false);
    expect(result.failures[0]?.reason).toBe("exit_code");
  });

  it("each call to the sandbox carries the problem's language and the harness code", async () => {
    const sandbox = new StubPassingProvider();
    await validateProblem(sample[0]!, sandbox);
    expect(sandbox.calls.length).toBe(sample[0]!.hidden_tests.length);
    for (const call of sandbox.calls) {
      expect(call.language).toBe(sample[0]!.language);
      expect(call.code.length).toBeGreaterThan(0);
      expect(call.code).toContain(sample[0]!.reference_solution.trim());
    }
  });
});

describe.skipIf(!REQUIRE_PISTON)(
  "validateProblems (integration, real Piston) — LEARNPRO_REQUIRE_PISTON=1",
  () => {
    const provider = new PistonSandboxProvider({
      transport: new PistonHttpTransport({ baseUrl: PISTON_URL }),
    });

    it(
      "every reference solution passes every hidden test on the live sandbox",
      async () => {
        const all = loadProblems();
        const results = await validateProblems(all, provider, { time_limit_ms: 8_000 });
        const failed = results.filter((r) => !r.passed);
        for (const r of failed) {
          // Surface the first failure detail so a regression is easy to read.
          console.error(`[${r.language}/${r.slug}]`, r.failures.slice(0, 2));
        }
        expect(failed).toEqual([]);
      },
      // 60 problems × multiple hidden tests × Piston roundtrip — give it room.
      10 * 60 * 1000,
    );
  },
);
