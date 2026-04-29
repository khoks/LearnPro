// STORY-010 — Hardening item: no network.
//
// Real-Piston mode: opening any TCP socket from inside a sandboxed run must fail with a
// "network unreachable" error. Stub mode: the harness replays the canonical denial shape so
// the assertion contract is exercised in CI.

import { describe, expect, it } from "vitest";
import { runBreakout } from "./harness.js";

describe("hardening: no network — TCP socket connect is blocked", () => {
  it("python socket.connect((1.1.1.1, 80)) fails with a network error", async () => {
    const { response } = await runBreakout({
      id: "no-network-socket",
      language: "python",
      code: [
        "import socket, sys",
        "s = socket.socket()",
        "s.settimeout(2)",
        "try:",
        "    s.connect(('1.1.1.1', 80))",
        "    print('CONNECTED')",
        "    sys.exit(0)",
        "except OSError as e:",
        "    print('BLOCKED', file=sys.stderr)",
        "    sys.exit(1)",
      ].join("\n"),
    });
    expect(response.exit_code).not.toBe(0);
    expect(response.stdout).not.toContain("CONNECTED");
    expect(response.stderr.toLowerCase()).toMatch(
      /unreachable|network is unreachable|permission|operation not permitted|blocked/,
    );
  });
});

describe("hardening: no network — urllib HTTP request is blocked", () => {
  it("python urllib.request.urlopen(http://example.com) fails", async () => {
    const { response } = await runBreakout({
      id: "no-network-urllib",
      language: "python",
      code: [
        "import sys, urllib.request",
        "try:",
        "    urllib.request.urlopen('http://example.com', timeout=2).read()",
        "    print('FETCHED')",
        "    sys.exit(0)",
        "except Exception as e:",
        "    print(repr(e), file=sys.stderr)",
        "    sys.exit(1)",
      ].join("\n"),
    });
    expect(response.exit_code).not.toBe(0);
    expect(response.stdout).not.toContain("FETCHED");
    expect(response.stderr.toLowerCase()).toMatch(
      /urlerror|unreachable|connection refused|permission|operation not permitted|blocked/,
    );
  });
});
