import { describe, expect, it } from "vitest";
import { buildSandboxProvider, loadSandboxConfigFromEnv, SandboxConfigSchema } from "./registry.js";
import type { PistonTransport } from "./piston.js";

const noopTransport: PistonTransport = {
  async execute() {
    return {
      language: "python",
      version: "3.10.0",
      run: { stdout: "", stderr: "", code: 0, signal: null },
    };
  },
};

describe("SandboxConfigSchema", () => {
  it("defaults to piston at http://localhost:2000", () => {
    const cfg = SandboxConfigSchema.parse({});
    expect(cfg.provider).toBe("piston");
    expect(cfg.baseUrl).toBe("http://localhost:2000");
  });

  it("accepts a baseUrl override", () => {
    const cfg = SandboxConfigSchema.parse({ baseUrl: "http://piston.local:2000" });
    expect(cfg.baseUrl).toBe("http://piston.local:2000");
  });

  it("rejects a non-URL baseUrl", () => {
    expect(() => SandboxConfigSchema.parse({ baseUrl: "not-a-url" })).toThrow();
  });
});

describe("buildSandboxProvider", () => {
  it("builds PistonSandboxProvider with injected transport", () => {
    const provider = buildSandboxProvider({ pistonTransport: noopTransport });
    expect(provider.name).toBe("piston");
  });

  it("builds with default HTTP transport when none injected", () => {
    const provider = buildSandboxProvider({});
    expect(provider.name).toBe("piston");
  });
});

describe("loadSandboxConfigFromEnv", () => {
  it("returns defaults when env var is not set", () => {
    expect(loadSandboxConfigFromEnv({})).toEqual(SandboxConfigSchema.parse({}));
  });

  it("uses PISTON_URL when set", () => {
    const cfg = loadSandboxConfigFromEnv({ PISTON_URL: "http://piston.dev:2000" });
    expect(cfg.baseUrl).toBe("http://piston.dev:2000");
  });

  it("parses LEARNPRO_SANDBOX_CONFIG JSON", () => {
    const cfg = loadSandboxConfigFromEnv({
      LEARNPRO_SANDBOX_CONFIG: JSON.stringify({ baseUrl: "http://x:2000" }),
    });
    expect(cfg.baseUrl).toBe("http://x:2000");
  });

  it("throws on invalid JSON", () => {
    expect(() => loadSandboxConfigFromEnv({ LEARNPRO_SANDBOX_CONFIG: "{bad" })).toThrow(
      /not valid JSON/,
    );
  });
});
