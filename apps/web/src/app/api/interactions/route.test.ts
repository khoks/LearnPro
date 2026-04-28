import type { InteractionEvent } from "@learnpro/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/interactions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/interactions (Next.js Route Handler)", () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    process.env["LEARNPRO_API_URL"] = "http://api.test";
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env["LEARNPRO_API_URL"];
  });

  it("forwards a valid batch to the API and pipes the upstream 202 response back", async () => {
    const fakeFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ accepted: 2 }), {
        status: 202,
        headers: { "content-type": "application/json" },
      }),
    );
    globalThis.fetch = fakeFetch as unknown as typeof fetch;

    const events: InteractionEvent[] = [
      { type: "cursor_focus", payload: { line_start: 1, line_end: 2, duration_ms: 100 } },
      { type: "submit", payload: { passed: true } },
    ];
    const res = await POST(postRequest({ events }));

    expect(res.status).toBe(202);
    const json = (await res.json()) as { accepted: number };
    expect(json.accepted).toBe(2);
    expect(fakeFetch).toHaveBeenCalledWith(
      "http://api.test/v1/interactions",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("returns 400 with error=invalid_json when the body is not JSON", async () => {
    const req = new Request("http://localhost/api/interactions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("invalid_json");
  });

  it("returns 400 with error=invalid_request for an empty batch", async () => {
    const res = await POST(postRequest({ events: [] }));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("invalid_request");
  });

  it("returns 502 when the upstream fetch throws", async () => {
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new Error("connect ECONNREFUSED")) as unknown as typeof fetch;

    const res = await POST(
      postRequest({ events: [{ type: "submit", payload: { passed: true } }] }),
    );
    expect(res.status).toBe(502);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("api_unreachable");
  });

  it("propagates upstream non-2xx status codes through to the client", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "interactions_unavailable", message: "store down" }), {
        status: 503,
        headers: { "content-type": "application/json" },
      }),
    ) as unknown as typeof fetch;

    const res = await POST(
      postRequest({ events: [{ type: "submit", payload: { passed: true } }] }),
    );
    expect(res.status).toBe(503);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("interactions_unavailable");
  });

  it("defaults to http://localhost:4000 when LEARNPRO_API_URL is unset", async () => {
    delete process.env["LEARNPRO_API_URL"];
    const fakeFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ accepted: 1 }), {
        status: 202,
        headers: { "content-type": "application/json" },
      }),
    );
    globalThis.fetch = fakeFetch as unknown as typeof fetch;

    await POST(postRequest({ events: [{ type: "submit", payload: { passed: true } }] }));
    expect(fakeFetch).toHaveBeenCalledWith(
      "http://localhost:4000/v1/interactions",
      expect.any(Object),
    );
  });
});
