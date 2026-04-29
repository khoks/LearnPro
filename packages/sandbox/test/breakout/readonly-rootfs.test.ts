// STORY-010 — Hardening item: read-only root filesystem.
//
// A write to anywhere outside `/tmp` must fail with EROFS (Read-only file system) or an
// equivalent "permission denied / operation not permitted" error. Stub mode replays the
// canonical EROFS error.

import { describe, expect, it } from "vitest";
import { runBreakout } from "./harness.js";

describe("hardening: read-only rootfs — writes outside /tmp fail", () => {
  it("python open('/etc/learnpro-breakout', 'w') fails with EROFS / permission denied", async () => {
    const { response } = await runBreakout({
      id: "readonly-rootfs-write",
      language: "python",
      code: [
        "import sys",
        "try:",
        "    f = open('/etc/learnpro-breakout', 'w')",
        "    f.write('pwned')",
        "    f.close()",
        "    print('WROTE')",
        "    sys.exit(0)",
        "except OSError as e:",
        "    print(repr(e), file=sys.stderr)",
        "    sys.exit(1)",
      ].join("\n"),
    });
    expect(response.exit_code).not.toBe(0);
    expect(response.stdout).not.toContain("WROTE");
    expect(response.stderr.toLowerCase()).toMatch(
      /read-only file system|erofs|permission denied|operation not permitted|errno 30/,
    );
  });
});
