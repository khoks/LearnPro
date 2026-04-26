import { describe, expect, it } from "vitest";
import type { SandboxRunResponse } from "@learnpro/sandbox";
import { runResultStatus, statusFor } from "./status";

function ok(over: Partial<SandboxRunResponse> = {}): SandboxRunResponse {
  return {
    stdout: "",
    stderr: "",
    exit_code: 0,
    duration_ms: 5,
    killed_by: null,
    language: "python",
    runtime_version: "3.10.0",
    ...over,
  };
}

describe("statusFor", () => {
  it("returns Idle when result is null", () => {
    expect(statusFor(null).label).toBe("Idle");
  });

  it("returns Error label when run helper failed (network/protocol)", () => {
    const s = statusFor({ ok: false, status: 502, error: "api_unreachable" });
    expect(s.label).toBe("Error: api_unreachable");
    expect(s.color).toBe("#c33");
  });

  it("returns OK when exit_code=0 and not killed", () => {
    expect(statusFor({ ok: true, result: ok() }).label).toBe("OK");
  });

  it("returns Killed (timeout) when killed_by=timeout", () => {
    const s = statusFor({
      ok: true,
      result: ok({ exit_code: null, killed_by: "timeout" }),
    });
    expect(s.label).toBe("Killed (timeout)");
    expect(s.color).toBe("#c33");
  });

  it("returns Exit N when exit_code!=0 and not killed", () => {
    const s = statusFor({ ok: true, result: ok({ exit_code: 1 }) });
    expect(s.label).toBe("Exit 1");
    expect(s.color).toBe("#c33");
  });
});

describe("runResultStatus (direct)", () => {
  it("classifies OOM as Killed (memory)", () => {
    expect(runResultStatus(ok({ exit_code: null, killed_by: "memory" })).label).toBe(
      "Killed (memory)",
    );
  });

  it("classifies output-limit as Killed (output-limit)", () => {
    expect(runResultStatus(ok({ killed_by: "output-limit" })).label).toBe("Killed (output-limit)");
  });
});
