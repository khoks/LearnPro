// STORY-010 — Hardening item: non-root UID.
//
// `os.getuid()` inside the run must return a non-zero, non-system UID (>= 100). Running as
// root in a sandbox is the canonical defense-in-depth failure.

import { describe, expect, it } from "vitest";
import { runBreakout } from "./harness.js";

describe("hardening: non-root UID — runs as a non-root user", () => {
  it("python os.getuid() is non-zero and non-system", async () => {
    const { response } = await runBreakout({
      id: "non-root-uid",
      language: "python",
      code: "import os\nprint(os.getuid())",
    });
    expect(response.exit_code).toBe(0);
    const uid = Number.parseInt(response.stdout.trim(), 10);
    expect(Number.isFinite(uid)).toBe(true);
    expect(uid).not.toBe(0);
    expect(uid).toBeGreaterThanOrEqual(100);
  });
});
