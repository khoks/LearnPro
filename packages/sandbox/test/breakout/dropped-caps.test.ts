// STORY-010 — Hardening item: drop all caps.
//
// `cat /proc/self/status | grep CapEff` must show 0000000000000000 (the empty effective
// capability set), proving the runtime drops every capability before exec'ing user code.

import { describe, expect, it } from "vitest";
import { runBreakout } from "./harness.js";

describe("hardening: dropped caps — CapEff is empty", () => {
  it("python /proc/self/status shows CapEff=0000000000000000", async () => {
    const { response } = await runBreakout({
      id: "dropped-caps",
      language: "python",
      code: [
        "with open('/proc/self/status') as f:",
        "    for line in f:",
        "        if line.startswith('CapEff:'):",
        "            print(line, end='')",
      ].join("\n"),
    });
    expect(response.exit_code).toBe(0);
    const cap = response.stdout.match(/CapEff:\s+([0-9a-f]+)/i);
    expect(cap).not.toBeNull();
    expect(cap?.[1]).toBe("0000000000000000");
  });
});
