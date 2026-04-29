// STORY-010 — Hardening item: output truncation.
//
// Programs that print 100+ MB must not blow up the API. The provider truncates stdout/stderr
// to `output_limit_bytes` (with a small `[truncated]` marker tail) and surfaces
// `killed_by === "output-limit"` so the UI can explain what happened.

import { describe, expect, it } from "vitest";
import { runBreakout } from "./harness.js";

describe("hardening: output truncation — large stdout is capped", () => {
  it("python `print('x' * 10**8)` is truncated and reported", async () => {
    const cap = 1_024;
    const { response } = await runBreakout({
      id: "output-truncation",
      language: "python",
      code: "print('x' * (10**6))",
      output_limit_bytes: cap,
    });
    const stdoutBytes = new TextEncoder().encode(response.stdout).length;
    expect(stdoutBytes).toBeLessThanOrEqual(cap + 64);
    expect(response.killed_by).toBe("output-limit");
  });
});
