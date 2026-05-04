import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockHeaders } = vi.hoisted(() => ({ mockHeaders: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: mockHeaders,
}));

import { POST } from "./route";

const TRACK_ID = "11111111-1111-4111-8111-111111111111";

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/tutor/episodes", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/tutor/episodes (Next.js Route Handler)", () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    process.env["LEARNPRO_API_URL"] = "http://api.test";
    mockHeaders.mockResolvedValue({
      get: (name: string) => (name === "cookie" ? "authjs.session-token=abc123" : null),
    });
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env["LEARNPRO_API_URL"];
    mockHeaders.mockReset();
  });

  it("forwards a valid track_id and pipes the upstream 201 back", async () => {
    const upstreamBody = {
      episode_id: "22222222-2222-4222-8222-222222222222",
      problem_id: "33333333-3333-4333-8333-333333333333",
      problem_slug: "two-sum",
    };
    const fakeFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(upstreamBody), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );
    globalThis.fetch = fakeFetch as unknown as typeof fetch;

    const res = await POST(postRequest({ track_id: TRACK_ID }));

    expect(res.status).toBe(201);
    const json = (await res.json()) as { problem_slug: string };
    expect(json.problem_slug).toBe("two-sum");
    expect(fakeFetch).toHaveBeenCalledWith(
      "http://api.test/v1/tutor/episodes",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("forwards the Auth.js session cookie upstream", async () => {
    const fakeFetch = vi.fn().mockResolvedValue(
      new Response("{}", {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );
    globalThis.fetch = fakeFetch as unknown as typeof fetch;

    await POST(postRequest({ track_id: TRACK_ID }));

    const call = fakeFetch.mock.calls[0]?.[1] as RequestInit | undefined;
    const headers = call?.headers as Record<string, string> | undefined;
    expect(headers?.["cookie"]).toBe("authjs.session-token=abc123");
  });

  it("returns 400 invalid_json when body is not JSON", async () => {
    const req = new Request("http://localhost/api/tutor/episodes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("invalid_json");
  });

  it("returns 400 invalid_request when track_id is missing or not a UUID", async () => {
    const res1 = await POST(postRequest({}));
    expect(res1.status).toBe(400);
    expect(((await res1.json()) as { error: string }).error).toBe("invalid_request");

    const res2 = await POST(postRequest({ track_id: "not-a-uuid" }));
    expect(res2.status).toBe(400);
    expect(((await res2.json()) as { error: string }).error).toBe("invalid_request");
  });

  it("returns 502 when the upstream fetch throws", async () => {
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new Error("connect ECONNREFUSED")) as unknown as typeof fetch;

    const res = await POST(postRequest({ track_id: TRACK_ID }));
    expect(res.status).toBe(502);
    expect(((await res.json()) as { error: string }).error).toBe("api_unreachable");
  });

  it("propagates upstream non-2xx through (e.g. 429)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "daily_budget_exceeded" }), {
        status: 429,
        headers: { "content-type": "application/json" },
      }),
    ) as unknown as typeof fetch;

    const res = await POST(postRequest({ track_id: TRACK_ID }));
    expect(res.status).toBe(429);
    expect(((await res.json()) as { error: string }).error).toBe("daily_budget_exceeded");
  });

  it("propagates 401 from upstream", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    ) as unknown as typeof fetch;

    const res = await POST(postRequest({ track_id: TRACK_ID }));
    expect(res.status).toBe(401);
  });

  it("defaults to http://localhost:4000 when LEARNPRO_API_URL is unset", async () => {
    delete process.env["LEARNPRO_API_URL"];
    const fakeFetch = vi.fn().mockResolvedValue(
      new Response("{}", {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );
    globalThis.fetch = fakeFetch as unknown as typeof fetch;

    await POST(postRequest({ track_id: TRACK_ID }));
    expect(fakeFetch).toHaveBeenCalledWith(
      "http://localhost:4000/v1/tutor/episodes",
      expect.any(Object),
    );
  });
});
