// STORY-010 — sandbox hardening breakout harness.
//
// Two execution modes, gated by env:
//
//   1. Real-Piston mode — set LEARNPRO_REQUIRE_PISTON=1 and PISTON_URL=<base>. The breakout
//      tests hit a live Piston container expected to be hardened per ADR-0002 and assert that
//      every breakout attempt fails. Run locally.
//
//   2. Stub mode (default, runs in CI) — the harness uses a `HardenedStubSandboxProvider`
//      that simulates the canonical denial response shape for each breakout class. This
//      verifies the *test harness* and the contract a hardened provider must satisfy, without
//      requiring Piston in CI.
//
// Each breakout test calls `runBreakout(scenario)` — the helper picks real-Piston or stub
// based on env and returns a normalized `SandboxRunResponse`. Tests then assert on that
// response with the same shape regardless of mode.
//
// New scenarios added here MUST also be wired into the stub provider's response table.

import {
  type SandboxKilledBy,
  type SandboxLanguage,
  type SandboxProvider,
  type SandboxRunRequest,
  type SandboxRunResponse,
  PistonHttpTransport,
  PistonSandboxProvider,
} from "../../src/index.js";

export type BreakoutScenarioId =
  | "no-network-socket"
  | "no-network-urllib"
  | "readonly-rootfs-write"
  | "tmpfs-tmp-vanish"
  | "cpu-cgroup-busyloop"
  | "memory-cgroup-oom"
  | "pid-cgroup-forkbomb"
  | "wallclock-timeout"
  | "output-truncation"
  | "dropped-caps"
  | "non-root-uid"
  | "seccomp-mount"
  | "seccomp-ptrace";

export interface BreakoutScenario {
  id: BreakoutScenarioId;
  language: SandboxLanguage;
  code: string;
  // Override the default time/memory/output limits if a scenario needs tighter / looser bounds.
  time_limit_ms?: number;
  memory_limit_mb?: number;
  output_limit_bytes?: number;
}

export const REQUIRE_PISTON = process.env["LEARNPRO_REQUIRE_PISTON"] === "1";
export const PISTON_URL = process.env["PISTON_URL"] ?? "http://localhost:2000";

// --- Stub provider --------------------------------------------------------------------------
//
// The stub returns the canonical "this breakout was blocked" response shape for each scenario.
// A hardened real provider should produce a response with the same `killed_by` / non-zero exit
// pattern; assertions in the breakout tests are written against that shared contract.

const STUB_RESPONSES: Record<BreakoutScenarioId, SandboxRunResponse> = {
  "no-network-socket": denied("python", {
    stderr: "OSError: [Errno 101] Network is unreachable\n",
    exit_code: 1,
  }),
  "no-network-urllib": denied("python", {
    stderr: "urllib.error.URLError: <urlopen error [Errno 101] Network is unreachable>\n",
    exit_code: 1,
  }),
  "readonly-rootfs-write": denied("python", {
    stderr: "OSError: [Errno 30] Read-only file system: '/etc/learnpro-breakout'\n",
    exit_code: 1,
  }),
  "tmpfs-tmp-vanish": {
    stdout: "wrote ok\n",
    stderr: "",
    exit_code: 0,
    duration_ms: 12,
    killed_by: null,
    language: "python",
  },
  "cpu-cgroup-busyloop": {
    stdout: "",
    stderr: "",
    exit_code: null,
    duration_ms: 1_050,
    killed_by: "timeout",
    language: "python",
  },
  "memory-cgroup-oom": {
    stdout: "",
    stderr: "MemoryError\n",
    exit_code: null,
    duration_ms: 200,
    killed_by: "memory",
    language: "python",
  },
  "pid-cgroup-forkbomb": denied("python", {
    stderr: "BlockingIOError: [Errno 11] Resource temporarily unavailable\n",
    exit_code: 1,
  }),
  "wallclock-timeout": {
    stdout: "",
    stderr: "",
    exit_code: null,
    duration_ms: 1_050,
    killed_by: "timeout",
    language: "python",
  },
  "output-truncation": {
    stdout: "x".repeat(1_000) + "\n[truncated]",
    stderr: "",
    exit_code: 0,
    duration_ms: 50,
    killed_by: "output-limit",
    language: "python",
  },
  "dropped-caps": {
    stdout: "CapEff:\t0000000000000000\n",
    stderr: "",
    exit_code: 0,
    duration_ms: 12,
    killed_by: null,
    language: "python",
  },
  "non-root-uid": {
    stdout: "1000\n",
    stderr: "",
    exit_code: 0,
    duration_ms: 12,
    killed_by: null,
    language: "python",
  },
  "seccomp-mount": denied("python", {
    stderr: "PermissionError: [Errno 1] Operation not permitted\n",
    exit_code: 1,
  }),
  "seccomp-ptrace": denied("python", {
    stderr: "PermissionError: [Errno 1] Operation not permitted\n",
    exit_code: 1,
  }),
};

function denied(
  language: SandboxLanguage,
  parts: { stderr: string; exit_code: number | null; killed_by?: SandboxKilledBy | null },
): SandboxRunResponse {
  return {
    stdout: "",
    stderr: parts.stderr,
    exit_code: parts.exit_code,
    duration_ms: 25,
    killed_by: parts.killed_by ?? null,
    language,
  };
}

class HardenedStubSandboxProvider implements SandboxProvider {
  readonly name = "stub";
  private readonly scenario: BreakoutScenarioId;

  constructor(scenario: BreakoutScenarioId) {
    this.scenario = scenario;
  }

  async run(_req: SandboxRunRequest): Promise<SandboxRunResponse> {
    const r = STUB_RESPONSES[this.scenario];
    return Promise.resolve(r);
  }
}

// --- runBreakout entry point ----------------------------------------------------------------

export interface RunBreakoutResult {
  mode: "real-piston" | "stub";
  response: SandboxRunResponse;
}

export async function runBreakout(scenario: BreakoutScenario): Promise<RunBreakoutResult> {
  const req: SandboxRunRequest = {
    language: scenario.language,
    code: scenario.code,
    time_limit_ms: scenario.time_limit_ms ?? 1_500,
    memory_limit_mb: scenario.memory_limit_mb ?? 64,
    output_limit_bytes: scenario.output_limit_bytes ?? 16 * 1024,
  };
  if (REQUIRE_PISTON) {
    const provider = new PistonSandboxProvider({
      transport: new PistonHttpTransport({ baseUrl: PISTON_URL }),
    });
    const response = await provider.run(req);
    return { mode: "real-piston", response };
  }
  const stub = new HardenedStubSandboxProvider(scenario.id);
  const response = await stub.run(req);
  return { mode: "stub", response };
}

// Vitest's `describe.skipIf` predicate — true means "skip this describe in this mode."
export const skipUnlessRealPiston = !REQUIRE_PISTON;
