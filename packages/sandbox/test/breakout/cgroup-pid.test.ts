// STORY-010 — Hardening item: PID cgroup.
//
// A fork-bomb (recursive os.fork) must be capped at the configured pid limit — additional
// forks fail with EAGAIN (BlockingIOError) rather than exhausting host PIDs.

import { describe, expect, it } from "vitest";
import { runBreakout } from "./harness.js";

describe("hardening: PID cgroup — fork bomb is capped", () => {
  it("python recursive os.fork() hits the pid cap and errors out", async () => {
    const { response } = await runBreakout({
      id: "pid-cgroup-forkbomb",
      language: "python",
      code: [
        "import os, sys",
        "count = 0",
        "try:",
        "    while True:",
        "        os.fork()",
        "        count += 1",
        "        if count > 10000:",
        "            print('UNLIMITED', count)",
        "            sys.exit(0)",
        "except (OSError, BlockingIOError) as e:",
        "    print(repr(e), file=sys.stderr)",
        "    sys.exit(1)",
      ].join("\n"),
      time_limit_ms: 2_000,
    });
    expect(response.exit_code).not.toBe(0);
    expect(response.stdout).not.toContain("UNLIMITED");
  });
});
