import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockHeaders } = vi.hoisted(() => ({ mockHeaders: vi.fn() }));
vi.mock("next/headers", () => ({ headers: mockHeaders }));

import { POST } from "./route";

const validBody = {
  endpoint: "https://fcm.googleapis.com/fcm/send/abc",
  keys: { p256dh: "p", auth: "a" },
};

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/notifications/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/notifications/subscribe (Next.js Route Handler)", () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    process.env["LEARNPRO_API_URL"] = "http://api.test";
    mockHeaders.mockResolvedValue({
      get: (n: string) => (n === "cookie" ? "authjs.session-token=abc" : null),
    });
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env["LEARNPRO_API_URL"];
    mockHeaders.mockReset();
  });

  it("rejects non-JSON bodies with 400 invalid_json", async () => {
    const req = new Request("http://localhost/api/notifications/subscribe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_json");
  });

  it("rejects malformed bodies with 400 invalid_request", async () => {
    const res = await POST(postRequest({ endpoint: "not-a-url", keys: {} }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_request");
  });

  it("forwards a valid body upstream and pipes the 201 back", async () => {
    const fakeFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "sub-1" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );
    globalThis.fetch = fakeFetch as unknown as typeof fetch;
    const res = await POST(postRequest(validBody));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string };
    expect(body.id).toBe("sub-1");
    const call = fakeFetch.mock.calls[0]?.[1] as RequestInit | undefined;
    const headers = call?.headers as Record<string, string> | undefined;
    expect(headers?.["cookie"]).toBe("authjs.session-token=abc");
  });

  it("propagates upstream 401 / 503", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    ) as unknown as typeof fetch;
    const res = await POST(postRequest(validBody));
    expect(res.status).toBe(401);
  });

  it("returns 502 when upstream fetch throws", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("nope")) as unknown as typeof fetch;
    const res = await POST(postRequest(validBody));
    expect(res.status).toBe(502);
  });
});
