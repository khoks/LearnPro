import { describe, expect, it, vi } from "vitest";
import { runSandboxStream, type StreamEvent } from "./run-sandbox-stream";
import type { SandboxRunChunk } from "@learnpro/sandbox";

function sseResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/event-stream" },
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function chunked(...frames: string[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder();
      for (const f of frames) controller.enqueue(enc.encode(f));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

async function collect(gen: AsyncIterable<StreamEvent>): Promise<StreamEvent[]> {
  const out: StreamEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

describe("runSandboxStream", () => {
  it("yields parsed chunks in order and terminates on exit", async () => {
    const body =
      'event: stdout\ndata: {"type":"stdout","line":"alpha"}\n\n' +
      'event: stdout\ndata: {"type":"stdout","line":"beta"}\n\n' +
      'event: stderr\ndata: {"type":"stderr","line":"warn"}\n\n' +
      'event: exit\ndata: {"type":"exit","exit_code":0,"duration_ms":7,"killed_by":null,"language":"python"}\n\n';
    const fakeFetch = vi.fn().mockResolvedValue(sseResponse(body));
    const events = await collect(
      runSandboxStream(
        { language: "python", code: "print('a'); print('b')" },
        { fetchImpl: fakeFetch as unknown as typeof fetch },
      ),
    );
    expect(events.every((e) => e.ok)).toBe(true);
    const chunks = events.map((e) => (e.ok ? e.chunk : null)).filter(Boolean) as SandboxRunChunk[];
    expect(chunks.map((c) => c.type)).toEqual(["stdout", "stdout", "stderr", "exit"]);
  });

  it("POSTs to /api/sandbox/run-stream with the request body", async () => {
    const fakeFetch = vi
      .fn()
      .mockResolvedValue(
        sseResponse(
          'event: exit\ndata: {"type":"exit","exit_code":0,"duration_ms":1,"killed_by":null,"language":"python"}\n\n',
        ),
      );
    await collect(
      runSandboxStream(
        { language: "python", code: "print(1)" },
        { fetchImpl: fakeFetch as unknown as typeof fetch },
      ),
    );
    expect(fakeFetch).toHaveBeenCalledWith(
      "/api/sandbox/run-stream",
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json" },
      }),
    );
    const body = JSON.parse(
      (fakeFetch.mock.calls[0]?.[1] as RequestInit).body as string,
    ) as Record<string, unknown>;
    expect(body["language"]).toBe("python");
  });

  it("yields a single ok:false on a non-2xx response", async () => {
    const fakeFetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: "invalid_request", message: "bad" }, 400));
    const events = await collect(
      runSandboxStream(
        { language: "python", code: "" },
        { fetchImpl: fakeFetch as unknown as typeof fetch },
      ),
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ ok: false, error: "invalid_request", message: "bad" });
  });

  it("yields ok:false with error=network_error when fetch throws", async () => {
    const fakeFetch = vi.fn().mockRejectedValue(new Error("connect refused"));
    const events = await collect(
      runSandboxStream(
        { language: "python", code: "print(1)" },
        { fetchImpl: fakeFetch as unknown as typeof fetch },
      ),
    );
    expect(events).toHaveLength(1);
    if (events[0]?.ok !== false) throw new Error("expected error event");
    expect(events[0].error).toBe("network_error");
    expect(events[0].message).toContain("refused");
  });

  it("translates a stream-side error event into an ok:false terminator", async () => {
    const body =
      'event: stdout\ndata: {"type":"stdout","line":"a"}\n\n' +
      'event: error\ndata: {"error":"sandbox_unavailable","message":"upstream down"}\n\n';
    const fakeFetch = vi.fn().mockResolvedValue(sseResponse(body));
    const events = await collect(
      runSandboxStream(
        { language: "python", code: "print(1)" },
        { fetchImpl: fakeFetch as unknown as typeof fetch },
      ),
    );
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ ok: true, chunk: { type: "stdout", line: "a" } });
    expect(events[1]).toEqual({
      ok: false,
      error: "sandbox_unavailable",
      message: "upstream down",
    });
  });

  it("handles SSE blocks split across multiple network frames", async () => {
    const fakeFetch = vi.fn().mockResolvedValue(
      chunked(
        'event: stdout\ndata: {"type":"stdou',
        't","line":"x"}\n\nevent: ',
        "exit\ndata: ",
        '{"type":"exit","exit_code":0,"duration_ms":1,"killed_by":null,"language":"python"}\n\n',
      ),
    );
    const events = await collect(
      runSandboxStream(
        { language: "python", code: "print('x')" },
        { fetchImpl: fakeFetch as unknown as typeof fetch },
      ),
    );
    expect(events.every((e) => e.ok)).toBe(true);
    expect(
      (events.map((e) => (e.ok ? e.chunk : null)).filter(Boolean) as SandboxRunChunk[]).map(
        (c) => c.type,
      ),
    ).toEqual(["stdout", "exit"]);
  });

  it("rejects an unparseable chunk shape with ok:false / invalid_chunk", async () => {
    const body = 'event: stdout\ndata: {"type":"stdout"}\n\n';
    const fakeFetch = vi.fn().mockResolvedValue(sseResponse(body));
    const events = await collect(
      runSandboxStream(
        { language: "python", code: "print(1)" },
        { fetchImpl: fakeFetch as unknown as typeof fetch },
      ),
    );
    expect(events).toHaveLength(1);
    if (events[0]?.ok !== false) throw new Error("expected error event");
    expect(events[0].error).toBe("invalid_chunk");
  });
});
