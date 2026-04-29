import { describe, it, expect } from "vitest";
import type { InteractionStore, StoredInteraction } from "@learnpro/shared";
import {
  InMemoryUsageStore,
  TokenBudgetExceededError,
  type LLMProvider,
} from "@learnpro/llm";
import type { SandboxProvider, SandboxRunRequest, SandboxRunResponse } from "@learnpro/sandbox";
import { buildServer } from "./index.js";

class FakeInteractionStore implements InteractionStore {
  public batches: StoredInteraction[][] = [];
  public failNext = false;

  async recordBatch(events: StoredInteraction[]): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("simulated DB outage");
    }
    this.batches.push(events);
  }
}

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

  it("POST /sandbox/run accepts language=typescript (STORY-008)", async () => {
    const sandbox = new FakeSandbox((req) => ({
      stdout: "ts ok\n",
      stderr: "",
      exit_code: 0,
      duration_ms: 8,
      killed_by: null,
      language: req.language,
      runtime_version: "5.0.3",
    }));
    const app = buildServer({ sandbox });
    const res = await app.inject({
      method: "POST",
      url: "/sandbox/run",
      payload: { language: "typescript", code: "console.log('ts ok')" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as SandboxRunResponse;
    expect(body.language).toBe("typescript");
    expect(body.stdout).toBe("ts ok\n");
    expect(sandbox.lastReq?.language).toBe("typescript");
    await app.close();
  });

  describe("POST /v1/interactions (STORY-055)", () => {
    it("forwards a valid batch to the store and replies 202 with accepted count", async () => {
      const store = new FakeInteractionStore();
      const app = buildServer({ sandbox: new FakeSandbox(), interactionStore: store });
      const res = await app.inject({
        method: "POST",
        url: "/v1/interactions",
        payload: {
          events: [
            { type: "cursor_focus", payload: { line_start: 1, line_end: 2, duration_ms: 250 } },
            { type: "submit", payload: { passed: true } },
          ],
        },
      });
      expect(res.statusCode).toBe(202);
      expect(res.json()).toEqual({ accepted: 2 });
      expect(store.batches).toHaveLength(1);
      const batch = store.batches[0]!;
      expect(batch.map((e) => e.type)).toEqual(["cursor_focus", "submit"]);
      expect(batch.every((e) => e.t instanceof Date)).toBe(true);
      expect(batch.every((e) => e.user_id === null)).toBe(true); // anonymous until STORY-005
      await app.close();
    });

    it("preserves a client-supplied `t` (ISO string → Date)", async () => {
      const store = new FakeInteractionStore();
      const app = buildServer({ sandbox: new FakeSandbox(), interactionStore: store });
      const t = "2026-04-26T12:34:56.000Z";
      const res = await app.inject({
        method: "POST",
        url: "/v1/interactions",
        payload: { events: [{ type: "submit", payload: { passed: false }, t }] },
      });
      expect(res.statusCode).toBe(202);
      const batch = store.batches[0]!;
      expect(batch[0]!.t.toISOString()).toBe(t);
      await app.close();
    });

    it("rejects a malformed payload with 400 and the Zod issues", async () => {
      const store = new FakeInteractionStore();
      const app = buildServer({ sandbox: new FakeSandbox(), interactionStore: store });
      const res = await app.inject({
        method: "POST",
        url: "/v1/interactions",
        payload: { events: [{ type: "cursor_focus", payload: { rung: 7 } }] },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json() as { error: string; issues: unknown[] };
      expect(body.error).toBe("invalid_request");
      expect(Array.isArray(body.issues)).toBe(true);
      expect(store.batches).toHaveLength(0);
      await app.close();
    });

    it("rejects an empty batch with 400 (don't pay a round-trip for nothing)", async () => {
      const app = buildServer({ sandbox: new FakeSandbox() });
      const res = await app.inject({
        method: "POST",
        url: "/v1/interactions",
        payload: { events: [] },
      });
      expect(res.statusCode).toBe(400);
      await app.close();
    });

    it("returns 503 (not 500) when the store throws — client retries, no internal-error leak", async () => {
      const store = new FakeInteractionStore();
      store.failNext = true;
      const app = buildServer({ sandbox: new FakeSandbox(), interactionStore: store });
      const res = await app.inject({
        method: "POST",
        url: "/v1/interactions",
        payload: { events: [{ type: "submit", payload: { passed: true } }] },
      });
      expect(res.statusCode).toBe(503);
      expect(res.json()).toEqual({
        error: "interactions_unavailable",
        message: "telemetry store rejected the batch",
      });
      await app.close();
    });

    it("default store (none injected) accepts events without crashing — Noop drop", async () => {
      const app = buildServer({ sandbox: new FakeSandbox() });
      const res = await app.inject({
        method: "POST",
        url: "/v1/interactions",
        payload: { events: [{ type: "submit", payload: { passed: true } }] },
      });
      expect(res.statusCode).toBe(202);
      expect(res.json()).toEqual({ accepted: 1 });
      await app.close();
    });
  });
});
