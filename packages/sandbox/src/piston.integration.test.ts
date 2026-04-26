import { describe, expect, it } from "vitest";
import { PistonSandboxProvider } from "./piston.js";
import { PistonHttpTransport } from "./piston-http-transport.js";

const baseUrl = process.env["PISTON_URL"];
const describeIfPiston = baseUrl ? describe : describe.skip;

describeIfPiston("PistonSandboxProvider (integration — requires PISTON_URL)", () => {
  it("runs print('hello') and returns the expected stdout", async () => {
    const provider = new PistonSandboxProvider({
      transport: new PistonHttpTransport({ baseUrl: baseUrl! }),
    });
    const res = await provider.run({
      language: "python",
      code: "print('hello')",
      time_limit_ms: 5_000,
      memory_limit_mb: 128,
      output_limit_bytes: 64 * 1024,
    });
    expect(res.stdout.trim()).toBe("hello");
    expect(res.exit_code).toBe(0);
    expect(res.killed_by).toBeNull();
  }, 30_000);

  it("kills runaway code at the wall-clock timeout", async () => {
    const provider = new PistonSandboxProvider({
      transport: new PistonHttpTransport({ baseUrl: baseUrl! }),
    });
    const res = await provider.run({
      language: "python",
      code: "while True: pass",
      time_limit_ms: 1_000,
      memory_limit_mb: 128,
      output_limit_bytes: 64 * 1024,
    });
    expect(res.killed_by).toBe("timeout");
  }, 30_000);
});
