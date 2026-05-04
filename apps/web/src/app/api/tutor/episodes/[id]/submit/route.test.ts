import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockHeaders } = vi.hoisted(() => ({ mockHeaders: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: mockHeaders,
}));

import { POST } from "./route";

const EPISODE_ID = "11111111-1111-4111-8111-111111111111";

function postRequest(body: unknown): Request {
  return new Request(`http://localhost/api/tutor/episodes/${EPISODE_ID}/submit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function ctx(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

describe("POST /api/tutor/episodes/[id]/submit", () => {
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

  it("forwards a valid submit and pipes the upstream 200 back", async () => {
    const upstreamBody = {
      passed: true,
      hidden_test_results: [{ index: 0, passed: true }],
      rubric: { correctness: 1, idiomatic: 0.9, edge_case_coverage: 0.85 },
      prose_explanation: "Clean.",
      submission_id: "33333333-3333-4333-8333-333333333333",
      runtime_ms: 14,
    };
    const fakeFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(upstreamBody), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    globalThis.fetch = fakeFetch as unknown as typeof fetch;

    const res = await POST(postRequest({ code: "x = 1" }), ctx(EPISODE_ID));

    expect(res.status).toBe(200);
    const json = (await res.json()) as { passed: boolean };
    expect(json.passed).toBe(true);
    expect(fakeFetch).toHaveBeenCalledWith(
      `http://api.test/v1/tutor/episodes/${EPISODE_ID}/submit`,
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("forwards the Auth.js session cookie upstream", async () => {
    const fakeFetch = vi.fn().mockResolvedValue(
      new Response("{}", { status: 200, headers: { "content-type": "application/json" } }),
    );
    globalThis.fetch = fakeFetch as unknown as typeof fetch;

    await POST(postRequest({ code: "x = 1" }), ctx(EPISODE_ID));

    const call = fakeFetch.mock.calls[0]?.[1] as RequestInit | undefined;
    const headers = call?.headers as Record<string, string> | undefined;
    expect(headers?.["cookie"]).toBe("authjs.session-token=abc123");
  });

  it("rejects an empty code body with 400", async () => {
    const res = await POST(postRequest({ code: "" }), ctx(EPISODE_ID));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("invalid_request");
  });

  it("rejects a non-UUID episode id with 400", async () => {
    const res = await POST(postRequest({ code: "x = 1" }), ctx("not-a-uuid"));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("invalid_request");
  });

  it("returns 502 when the upstream fetch throws", async () => {
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new Error("connect ECONNREFUSED")) as unknown as typeof fetch;

    const res = await POST(postRequest({ code: "x = 1" }), ctx(EPISODE_ID));
    expect(res.status).toBe(502);
    expect(((await res.json()) as { error: string }).error).toBe("api_unreachable");
  });

  it("propagates upstream 429 daily_budget_exceeded through unchanged", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "daily_budget_exceeded" }), {
        status: 429,
        headers: { "content-type": "application/json" },
      }),
    ) as unknown as typeof fetch;

    const res = await POST(postRequest({ code: "x = 1" }), ctx(EPISODE_ID));
    expect(res.status).toBe(429);
    expect(((await res.json()) as { error: string }).error).toBe("daily_budget_exceeded");
  });
});
