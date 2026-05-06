import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/sandbox/run-stream", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function sseResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/event-stream" },
  });
}

describe("POST /api/sandbox/run-stream (Next.js Route Handler)", () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    process.env["LEARNPRO_API_URL"] = "http://api.test";
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env["LEARNPRO_API_URL"];
  });

  it("forwards a valid request to the API stream endpoint and pipes the body back", async () => {
    const upstreamBody =
      'event: stdout\ndata: {"type":"stdout","line":"hi"}\n\n' +
      'event: exit\ndata: {"type":"exit","exit_code":0,"duration_ms":1,"killed_by":null,"language":"python"}\n\n';
    const fakeFetch = vi.fn().mockResolvedValue(sseResponse(upstreamBody));
    globalThis.fetch = fakeFetch as unknown as typeof fetch;

    const res = await POST(postRequest({ language: "python", code: "print('hi')" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(res.headers.get("cache-control")).toBe("no-cache");
    const text = await res.text();
    expect(text).toBe(upstreamBody);
    expect(fakeFetch).toHaveBeenCalledWith(
      "http://api.test/v1/sandbox/run/stream",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("returns 400 with error=invalid_json when the body is not JSON", async () => {
    const req = new Request("http://localhost/api/sandbox/run-stream", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("invalid_json");
  });

  it("returns 400 with error=invalid_request when the request fails Zod validation", async () => {
    const res = await POST(postRequest({ language: "rust", code: "" }));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("invalid_request");
  });

  it("returns 502 with error=api_unreachable when the upstream fetch throws", async () => {
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new Error("connect ECONNREFUSED")) as unknown as typeof fetch;
    const res = await POST(postRequest({ language: "python", code: "print(1)" }));
    expect(res.status).toBe(502);
    const json = (await res.json()) as { error: string; message: string };
    expect(json.error).toBe("api_unreachable");
    expect(json.message).toContain("ECONNREFUSED");
  });
});
