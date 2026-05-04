import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockHeaders } = vi.hoisted(() => ({ mockHeaders: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: mockHeaders,
}));

import { POST } from "./route";

const EPISODE_ID = "11111111-1111-4111-8111-111111111111";

function postRequest(body: unknown): Request {
  return new Request(`http://localhost/api/tutor/episodes/${EPISODE_ID}/hint`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function ctx(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

describe("POST /api/tutor/episodes/[id]/hint", () => {
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

  it("forwards a valid hint request and pipes the upstream 200 back", async () => {
    const upstreamBody = { rung: 1, hint: "Think about pairs.", xp_cost: 5 };
    const fakeFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(upstreamBody), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    globalThis.fetch = fakeFetch as unknown as typeof fetch;

    const res = await POST(postRequest({ rung: 1 }), ctx(EPISODE_ID));

    expect(res.status).toBe(200);
    const json = (await res.json()) as { xp_cost: number };
    expect(json.xp_cost).toBe(5);
    expect(fakeFetch).toHaveBeenCalledWith(
      `http://api.test/v1/tutor/episodes/${EPISODE_ID}/hint`,
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("forwards the Auth.js session cookie upstream", async () => {
    const fakeFetch = vi
      .fn()
      .mockResolvedValue(
        new Response("{}", { status: 200, headers: { "content-type": "application/json" } }),
      );
    globalThis.fetch = fakeFetch as unknown as typeof fetch;

    await POST(postRequest({ rung: 2 }), ctx(EPISODE_ID));

    const call = fakeFetch.mock.calls[0]?.[1] as RequestInit | undefined;
    const headers = call?.headers as Record<string, string> | undefined;
    expect(headers?.["cookie"]).toBe("authjs.session-token=abc123");
  });

  it("rejects a non-UUID episode id with 400", async () => {
    const res = await POST(postRequest({ rung: 1 }), ctx("not-a-uuid"));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("invalid_request");
  });

  it("rejects an out-of-range rung with 400", async () => {
    const res = await POST(postRequest({ rung: 4 }), ctx(EPISODE_ID));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("invalid_request");
  });

  it("returns 400 invalid_json when body is not JSON", async () => {
    const req = new Request(`http://localhost/api/tutor/episodes/${EPISODE_ID}/hint`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    });
    const res = await POST(req, ctx(EPISODE_ID));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("invalid_json");
  });

  it("returns 502 when the upstream fetch throws", async () => {
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new Error("connect ECONNREFUSED")) as unknown as typeof fetch;

    const res = await POST(postRequest({ rung: 1 }), ctx(EPISODE_ID));
    expect(res.status).toBe(502);
    expect(((await res.json()) as { error: string }).error).toBe("api_unreachable");
  });

  it("propagates upstream 409 illegal_transition through unchanged", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "illegal_transition" }), {
        status: 409,
        headers: { "content-type": "application/json" },
      }),
    ) as unknown as typeof fetch;

    const res = await POST(postRequest({ rung: 1 }), ctx(EPISODE_ID));
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe("illegal_transition");
  });
});
