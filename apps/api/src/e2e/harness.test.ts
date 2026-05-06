// Smoke test for the STORY-063 e2e harness pieces. Asserts the fakes work in isolation; the
// full integration test (with a real Postgres) lives in `mvp-loop.e2e.test.ts` and is gated on
// `LEARNPRO_E2E=1`.

import { describe, expect, it } from "vitest";
import { AlwaysPassSandbox, FakeLLMQueue, buildFakeLLM, fixedUserSession } from "./harness.js";
import { VERDICT_PASS_TOKEN } from "@learnpro/problems";

describe("FakeLLMQueue", () => {
  it("returns queued texts in FIFO order", async () => {
    const q = new FakeLLMQueue(["one", "two"]);
    expect(q.next()).toBe("one");
    expect(q.next()).toBe("two");
    expect(q.calls).toBe(2);
  });

  it("falls back to a benign rubric stub when the queue runs dry", () => {
    const q = new FakeLLMQueue([]);
    const stub = q.next();
    const parsed = JSON.parse(stub) as {
      rubric: { correctness: number };
      prose_explanation: string;
    };
    expect(parsed.rubric.correctness).toBe(1);
    expect(typeof parsed.prose_explanation).toBe("string");
  });

  it("`enqueue` adds at the tail", () => {
    const q = new FakeLLMQueue();
    q.enqueue("first");
    q.enqueue("second");
    expect(q.next()).toBe("first");
    expect(q.next()).toBe("second");
  });
});

describe("buildFakeLLM", () => {
  it("`complete()` consumes one queue entry per call and returns the text verbatim", async () => {
    const queue = new FakeLLMQueue(["hello there"]);
    const llm = buildFakeLLM({ queue });
    const res = await llm.complete({
      messages: [{ role: "user", content: "ping" }],
      max_tokens: 64,
      temperature: 0.5,
    });
    expect(res.text).toBe("hello there");
    expect(res.usage.input_tokens).toBe(50);
    expect(res.usage.output_tokens).toBe(30);
    expect(queue.calls).toBe(1);
  });

  it("invokes the supplied telemetry sink so `agent_calls` rows can land in DB", async () => {
    const queue = new FakeLLMQueue(["hi"]);
    const events: { provider: string }[] = [];
    const llm = buildFakeLLM({
      queue,
      telemetry: { record: (e) => events.push({ provider: e.provider }) },
    });
    await llm.complete({
      messages: [{ role: "user", content: "x" }],
      max_tokens: 32,
      temperature: 0,
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.provider).toBe("anthropic");
  });
});

describe("AlwaysPassSandbox", () => {
  it("emits a verdict-pass token regardless of code so the grader sees all hidden tests pass", async () => {
    const sandbox = new AlwaysPassSandbox();
    const result = await sandbox.run({
      language: "python",
      code: "anything goes",
      time_limit_ms: 5000,
      memory_limit_mb: 128,
      output_limit_bytes: 64 * 1024,
    });
    expect(result.exit_code).toBe(0);
    expect(result.killed_by).toBeNull();
    expect(result.stdout).toContain(VERDICT_PASS_TOKEN);
    expect(sandbox.calls).toBe(1);
    expect(sandbox.lastReq?.code).toBe("anything goes");
  });

  it("supports both python and typescript request languages without translating", async () => {
    const sandbox = new AlwaysPassSandbox();
    const py = await sandbox.run({
      language: "python",
      code: "x",
      time_limit_ms: 5000,
      memory_limit_mb: 128,
      output_limit_bytes: 64 * 1024,
    });
    const ts = await sandbox.run({
      language: "typescript",
      code: "y",
      time_limit_ms: 5000,
      memory_limit_mb: 128,
      output_limit_bytes: 64 * 1024,
    });
    expect(py.language).toBe("python");
    expect(ts.language).toBe("typescript");
    expect(sandbox.calls).toBe(2);
  });
});

describe("fixedUserSession", () => {
  it("returns the supplied user/org/email regardless of request", async () => {
    const resolver = fixedUserSession({
      user_id: "u-1",
      org_id: "org-1",
      email: "u1@example.com",
    });
    const session = await resolver({} as never);
    expect(session).toEqual({ user_id: "u-1", org_id: "org-1", email: "u1@example.com" });
  });

  it("defaults org_id to 'self' and supplies a stable email when omitted", async () => {
    const resolver = fixedUserSession({ user_id: "u-2" });
    const session = await resolver({} as never);
    expect(session?.org_id).toBe("self");
    expect(session?.email).toContain("@learnpro.local");
  });
});
