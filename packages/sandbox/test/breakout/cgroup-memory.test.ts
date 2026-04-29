// STORY-010 — Hardening item: memory cgroup.
//
// Allocating ~2x the memory cap must trigger an OOM kill (killed_by=memory) rather than
// swapping on the host or completing successfully.

import { describe, expect, it } from "vitest";
import { runBreakout } from "./harness.js";

describe("hardening: memory cgroup — OOM allocation is killed", () => {
  it("python `bytearray(2x cap)` is killed by memory limit", async () => {
    const cap_mb = 32;
    const { response } = await runBreakout({
      id: "memory-cgroup-oom",
      language: "python",
      code: "x = bytearray(2 * 32 * 1024 * 1024)\nprint('ALLOCATED', len(x))",
      memory_limit_mb: cap_mb,
      time_limit_ms: 5_000,
    });
    expect(response.killed_by).toBe("memory");
    expect(response.exit_code).not.toBe(0);
    expect(response.stdout).not.toContain("ALLOCATED");
  });
});
