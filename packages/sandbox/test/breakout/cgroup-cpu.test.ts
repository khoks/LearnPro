// STORY-010 — Hardening item: CPU cgroup.
//
// A busy loop must be killed by the wall-clock timeout (the orchestrator-side enforcement)
// even though the program is "willing" to consume infinite CPU. The CPU cgroup also caps
// throughput per second; we cannot easily measure that in stub mode, so the structural test
// asserts the killed_by=timeout contract; live mode confirms the actual kill timing.

import { describe, expect, it } from "vitest";
import { runBreakout } from "./harness.js";

describe("hardening: CPU cgroup — busy loop is terminated", () => {
  it("python `while True: pass` is killed by timeout within budget", async () => {
    const start = Date.now();
    const { response } = await runBreakout({
      id: "cpu-cgroup-busyloop",
      language: "python",
      code: "while True:\n    pass",
      time_limit_ms: 1_000,
    });
    const elapsed = Date.now() - start;
    expect(response.killed_by).toBe("timeout");
    expect(response.exit_code).not.toBe(0);
    expect(elapsed).toBeLessThan(15_000);
  });
});
