import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockHeaders } = vi.hoisted(() => ({ mockHeaders: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: mockHeaders,
}));

import { POST } from "./route";

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/onboarding/turn", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/onboarding/turn (Next.js Route Handler)", () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    process.env["LEARNPRO_API_URL"] = "http://api.test";
    mockHeaders.mockResolvedValue({
      get: (name: string) => {
        if (name === "cookie") return "authjs.session-token=abc123";
        return null;
      },
    });
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env["LEARNPRO_API_URL"];
    mockHeaders.mockReset();
  });

  it("forwards a valid turn request to the API and pipes the upstream 200 response back", async () => {
    const upstreamBody = {
      assistant_message: "How much time per day?",
      captured: { target_role: "swe_intern" },
      done: false,
    };
    const fakeFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(upstreamBody), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    globalThis.fetch = fakeFetch as unknown as typeof fetch;

    const res = await POST(
      postRequest({
        messages: [
          { role: "assistant", content: "Hi! What role?" },
          { role: "user", content: "SWE intern" },
        ],
      }),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as { captured: { target_role: string } };
    expect(json.captured.target_role).toBe("swe_intern");
    expect(fakeFetch).toHaveBeenCalledWith(
      "http://api.test/v1/onboarding/turn",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("forwards the Auth.js session cookie upstream so apps/api can resolve the user", async () => {
    const fakeFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ assistant_message: "ok", captured: {}, done: false }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    globalThis.fetch = fakeFetch as unknown as typeof fetch;

    await POST(
      postRequest({
        messages: [{ role: "user", content: "hi" }],
      }),
    );

    const call = fakeFetch.mock.calls[0]?.[1] as RequestInit | undefined;
    const headers = call?.headers as Record<string, string> | undefined;
    expect(headers?.["cookie"]).toBe("authjs.session-token=abc123");
  });

  it("returns 400 with error=invalid_json when the body is not JSON", async () => {
    const req = new Request("http://localhost/api/onboarding/turn", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("invalid_json");
  });

  it("returns 400 with error=invalid_request for an empty messages array", async () => {
    const res = await POST(postRequest({ messages: [] }));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("invalid_request");
  });

  it("returns 502 when the upstream fetch throws", async () => {
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new Error("connect ECONNREFUSED")) as unknown as typeof fetch;

    const res = await POST(
      postRequest({ messages: [{ role: "user", content: "hi" }] }),
    );
    expect(res.status).toBe(502);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("api_unreachable");
  });

  it("propagates upstream non-2xx status codes through to the client (e.g. 429 budget)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ error: "daily_budget_exceeded", message: "..." }),
        { status: 429, headers: { "content-type": "application/json" } },
      ),
    ) as unknown as typeof fetch;

    const res = await POST(
      postRequest({ messages: [{ role: "user", content: "hi" }] }),
    );
    expect(res.status).toBe(429);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("daily_budget_exceeded");
  });

  it("propagates 401 from upstream when the session resolves to nothing", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    ) as unknown as typeof fetch;

    const res = await POST(
      postRequest({ messages: [{ role: "user", content: "hi" }] }),
    );
    expect(res.status).toBe(401);
  });

  it("defaults to http://localhost:4000 when LEARNPRO_API_URL is unset", async () => {
    delete process.env["LEARNPRO_API_URL"];
    const fakeFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ assistant_message: "ok", captured: {}, done: false }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    globalThis.fetch = fakeFetch as unknown as typeof fetch;

    await POST(postRequest({ messages: [{ role: "user", content: "hi" }] }));
    expect(fakeFetch).toHaveBeenCalledWith(
      "http://localhost:4000/v1/onboarding/turn",
      expect.any(Object),
    );
  });
});
