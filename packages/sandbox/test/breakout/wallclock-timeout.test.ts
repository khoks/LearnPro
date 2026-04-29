// STORY-010 — Hardening item: wall-clock timeout.
//
// `while True: pass` must be killed at the configured wall-clock budget, with
// `killed_by === "timeout"` returned to the caller. The orchestrator (Piston in MVP)
// enforces this independently of any in-program signal handling.

import { describe, expect, it } from "vitest";
import { runBreakout } from "./harness.js";

const SLACK_MS = 10_000;

describe("hardening: wall-clock timeout — runaway program is killed", () => {
  it("python `while True: pass` is killed at the budget with killed_by=timeout", async () => {
    const budget = 1_000;
    const start = Date.now();
    const { response } = await runBreakout({
      id: "wallclock-timeout",
      language: "python",
      code: "while True:\n    pass",
      time_limit_ms: budget,
    });
    const elapsed = Date.now() - start;
    expect(response.killed_by).toBe("timeout");
    expect(response.exit_code).not.toBe(0);
    expect(elapsed).toBeLessThan(budget + SLACK_MS);
  });
});
