import { describe, expect, it } from "vitest";
import {
  SandboxRequestError,
  type SandboxProvider,
  type SandboxRunChunk,
  type SandboxRunRequest,
  type SandboxRunResponse,
} from "@learnpro/sandbox";
import { buildServer } from "./index.js";

class StreamingSandbox implements SandboxProvider {
  readonly name = "streaming-fake";
  public lastReq: SandboxRunRequest | null = null;
  public runCalls = 0;

  constructor(
    private readonly response:
      | SandboxRunResponse
      | ((r: SandboxRunRequest) => SandboxRunResponse) = {
      stdout: "alpha\nbeta\n",
      stderr: "warn\n",
      exit_code: 0,
      duration_ms: 11,
      killed_by: null,
      language: "python",
      runtime_version: "3.10.0",
    },
  ) {}

  async run(req: SandboxRunRequest): Promise<SandboxRunResponse> {
    this.lastReq = req;
    this.runCalls += 1;
    return typeof this.response === "function" ? this.response(req) : this.response;
  }

  async *runStream(req: SandboxRunRequest): AsyncIterable<SandboxRunChunk> {
    const r = await this.run(req);
    for (const line of r.stdout.split("\n").filter((s) => s.length > 0)) {
      yield { type: "stdout", line };
    }
    for (const line of r.stderr.split("\n").filter((s) => s.length > 0)) {
      yield { type: "stderr", line };
    }
    yield {
      type: "exit",
      exit_code: r.exit_code,
      duration_ms: r.duration_ms,
      killed_by: r.killed_by,
      language: r.language,
      ...(r.runtime_version !== undefined && { runtime_version: r.runtime_version }),
    };
  }
}

class ThrowingSandbox implements SandboxProvider {
  readonly name = "throwing-fake";
  async run(): Promise<SandboxRunResponse> {
    throw new SandboxRequestError("upstream down", "throwing-fake", new Error("ECONNREFUSED"));
  }
  // eslint-disable-next-line require-yield -- run() throws first; the generator never yields.
  async *runStream(): AsyncIterable<SandboxRunChunk> {
    await this.run();
  }
}

interface ParsedSseEvent {
  event: string;
  data: unknown;
}

function parseSse(body: string): ParsedSseEvent[] {
  const events: ParsedSseEvent[] = [];
  for (const block of body.split("\n\n")) {
    const trimmed = block.trim();
    if (trimmed.length === 0) continue;
    let event: string | null = null;
    let data: string | null = null;
    for (const line of trimmed.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data = line.slice(5).trim();
    }
    if (event === null || data === null) continue;
    events.push({ event, data: JSON.parse(data) });
  }
  return events;
}

describe("POST /v1/sandbox/run/stream (STORY-059)", () => {
  it("returns 400 on invalid request body", async () => {
    const app = buildServer({ sandbox: new StreamingSandbox() });
    const res = await app.inject({
      method: "POST",
      url: "/v1/sandbox/run/stream",
      payload: { language: "rust", code: "" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: "invalid_request" });
    await app.close();
  });

  it("returns 200 + text/event-stream and emits one SSE event per chunk", async () => {
    const sandbox = new StreamingSandbox();
    const app = buildServer({ sandbox });
    const res = await app.inject({
      method: "POST",
      url: "/v1/sandbox/run/stream",
      payload: { language: "python", code: "print('alpha'); print('beta')" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/event-stream");
    expect(res.headers["cache-control"]).toBe("no-cache");
    expect(res.headers["x-accel-buffering"]).toBe("no");

    const events = parseSse(res.body);
    expect(events.map((e) => e.event)).toEqual(["stdout", "stdout", "stderr", "exit"]);
    expect(events[0]?.data).toEqual({ type: "stdout", line: "alpha" });
    expect(events[1]?.data).toEqual({ type: "stdout", line: "beta" });
    expect(events[2]?.data).toEqual({ type: "stderr", line: "warn" });
    const exit = events[3]?.data as Record<string, unknown>;
    expect(exit).toMatchObject({
      type: "exit",
      exit_code: 0,
      language: "python",
      runtime_version: "3.10.0",
    });
    await app.close();
  });

  it("calls sandbox.run() exactly once per stream (telemetry-once AC)", async () => {
    const sandbox = new StreamingSandbox();
    const app = buildServer({ sandbox });
    await app.inject({
      method: "POST",
      url: "/v1/sandbox/run/stream",
      payload: { language: "python", code: "print('hi')" },
    });
    expect(sandbox.runCalls).toBe(1);
    await app.close();
  });

  it("forwards the parsed request body (zod-validated) to runStream", async () => {
    const sandbox = new StreamingSandbox();
    const app = buildServer({ sandbox });
    await app.inject({
      method: "POST",
      url: "/v1/sandbox/run/stream",
      payload: { language: "typescript", code: "console.log(1)" },
    });
    expect(sandbox.lastReq?.language).toBe("typescript");
    // STORY-043 — the parsed shape normalizes `code: "..."` shorthand to `files[]`.
    const files = (
      sandbox.lastReq as unknown as { files?: Array<{ path: string; content: string }> }
    )?.files;
    expect(files?.[0]?.content).toBe("console.log(1)");
    expect(files?.[0]?.path).toBe("index.ts");
    // Default values from the Zod schema must be applied.
    expect(sandbox.lastReq?.time_limit_ms).toBeGreaterThan(0);
    expect(sandbox.lastReq?.memory_limit_mb).toBeGreaterThan(0);
    await app.close();
  });

  it("emits an `error` SSE event when the provider throws SandboxRequestError", async () => {
    const app = buildServer({ sandbox: new ThrowingSandbox() });
    const res = await app.inject({
      method: "POST",
      url: "/v1/sandbox/run/stream",
      payload: { language: "python", code: "print(1)" },
    });
    expect(res.statusCode).toBe(200);
    const events = parseSse(res.body);
    expect(events).toHaveLength(1);
    expect(events[0]?.event).toBe("error");
    expect(events[0]?.data).toMatchObject({ error: "sandbox_unavailable" });
    await app.close();
  });

  it("ends each chunk with a blank line so SSE parsers can frame events", async () => {
    const app = buildServer({ sandbox: new StreamingSandbox() });
    const res = await app.inject({
      method: "POST",
      url: "/v1/sandbox/run/stream",
      payload: { language: "python", code: "print('hi')" },
    });
    // Every well-formed SSE event ends with a blank line ("\n\n").
    expect(res.body.endsWith("\n\n")).toBe(true);
    const blocks = res.body.split("\n\n").filter((b) => b.trim().length > 0);
    for (const b of blocks) {
      expect(b).toMatch(/^event:\s\w+\ndata:\s/);
    }
    await app.close();
  });

  it("emits an exit chunk even when both stdout and stderr are empty", async () => {
    const sandbox = new StreamingSandbox({
      stdout: "",
      stderr: "",
      exit_code: 0,
      duration_ms: 1,
      killed_by: null,
      language: "python",
      runtime_version: "3.10.0",
    });
    const app = buildServer({ sandbox });
    const res = await app.inject({
      method: "POST",
      url: "/v1/sandbox/run/stream",
      payload: { language: "python", code: "pass" },
    });
    const events = parseSse(res.body);
    expect(events).toHaveLength(1);
    expect(events[0]?.event).toBe("exit");
    await app.close();
  });
});
