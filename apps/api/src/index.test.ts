import { describe, it, expect } from "vitest";
import type { SandboxProvider, SandboxRunRequest, SandboxRunResponse } from "@learnpro/sandbox";
import { buildServer } from "./index.js";

class FakeSandbox implements SandboxProvider {
  readonly name = "fake-sandbox";
  public lastReq: SandboxRunRequest | null = null;

  constructor(
    private readonly response:
      | SandboxRunResponse
      | ((r: SandboxRunRequest) => SandboxRunResponse) = {
      stdout: "hello\n",
      stderr: "",
      exit_code: 0,
      duration_ms: 12,
      killed_by: null,
      language: "python",
      runtime_version: "3.10.0",
    },
  ) {}

  async run(req: SandboxRunRequest): Promise<SandboxRunResponse> {
    this.lastReq = req;
    return typeof this.response === "function" ? this.response(req) : this.response;
  }
}

describe("apps/api", () => {
  it("GET /health returns ok payload", async () => {
    const app = buildServer({ sandbox: new FakeSandbox() });
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { ok: boolean; service: string };
    expect(body.ok).toBe(true);
    expect(body.service).toBe("api");
    await app.close();
  });

  it("GET /policies reports the wired policy implementations", async () => {
    const app = buildServer({ sandbox: new FakeSandbox() });
    const res = await app.inject({ method: "GET", url: "/policies" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      scoring: "rule-based-scoring",
      tone: "warm-coach-constant",
      difficulty: "elo-ewma",
      autonomy: "always-confirm",
    });
    await app.close();
  });

  it("GET /llm reports the wired provider name", async () => {
    const app = buildServer({ sandbox: new FakeSandbox() });
    const res = await app.inject({ method: "GET", url: "/llm" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ provider: "anthropic" });
    await app.close();
  });

  it("GET /sandbox reports the wired sandbox provider name", async () => {
    const app = buildServer({ sandbox: new FakeSandbox() });
    const res = await app.inject({ method: "GET", url: "/sandbox" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ provider: "fake-sandbox" });
    await app.close();
  });

  it("POST /sandbox/run forwards a valid request and returns the run result", async () => {
    const sandbox = new FakeSandbox();
    const app = buildServer({ sandbox });
    const res = await app.inject({
      method: "POST",
      url: "/sandbox/run",
      payload: { language: "python", code: "print('hello')" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as SandboxRunResponse;
    expect(body.stdout).toBe("hello\n");
    expect(body.exit_code).toBe(0);
    expect(sandbox.lastReq?.language).toBe("python");
    await app.close();
  });

  it("POST /sandbox/run rejects invalid input with 400", async () => {
    const app = buildServer({ sandbox: new FakeSandbox() });
    const res = await app.inject({
      method: "POST",
      url: "/sandbox/run",
      payload: { language: "rust", code: "" },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
