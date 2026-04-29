// STORY-010 — Hardening item: tmpfs /tmp.
//
// Writes to /tmp must succeed (tmpfs is RW) but vanish between executions. We can verify the
// "succeeds" half here; the "vanishes between runs" half is enforced at the container level
// (tmpfs mount option in docker-compose) and is verified live via a second run when
// LEARNPRO_REQUIRE_PISTON=1.

import { describe, expect, it } from "vitest";
import { runBreakout, REQUIRE_PISTON } from "./harness.js";

describe("hardening: tmpfs /tmp — writes succeed", () => {
  it("python writes to /tmp and reads back", async () => {
    const { response } = await runBreakout({
      id: "tmpfs-tmp-vanish",
      language: "python",
      code: [
        "import os",
        "with open('/tmp/learnpro-tmpfs-test', 'w') as f:",
        "    f.write('ok')",
        "with open('/tmp/learnpro-tmpfs-test') as f:",
        "    assert f.read() == 'ok'",
        "print('wrote ok')",
      ].join("\n"),
    });
    expect(response.exit_code).toBe(0);
    expect(response.stdout).toContain("wrote ok");
  });
});

describe.skipIf(!REQUIRE_PISTON)(
  "hardening: tmpfs /tmp — content does not persist across runs (live)",
  () => {
    it("a file written in one run is not visible in the next", async () => {
      const tag = `learnpro-${Date.now()}`;
      const write = await runBreakout({
        id: "tmpfs-tmp-vanish",
        language: "python",
        code: [
          "with open('/tmp/" + tag + "', 'w') as f:",
          "    f.write('persisted?')",
          "print('wrote ok')",
        ].join("\n"),
      });
      expect(write.response.exit_code).toBe(0);
      const read = await runBreakout({
        id: "tmpfs-tmp-vanish",
        language: "python",
        code: [
          "import os, sys",
          "if os.path.exists('/tmp/" + tag + "'):",
          "    print('PERSISTED', file=sys.stderr)",
          "    sys.exit(1)",
          "print('wrote ok')",
        ].join("\n"),
      });
      expect(read.response.exit_code).toBe(0);
      expect(read.response.stderr).not.toContain("PERSISTED");
    });
  },
);
