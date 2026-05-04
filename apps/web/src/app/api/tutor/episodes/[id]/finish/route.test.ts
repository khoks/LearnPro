import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockHeaders } = vi.hoisted(() => ({ mockHeaders: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: mockHeaders,
}));

import { POST } from "./route";

const EPISODE_ID = "11111111-1111-4111-8111-111111111111";

function postRequest(body: unknown, opts?: { rawBody?: string }): Request {
  return new Request(`http://localhost/api/tutor/episodes/${EPISODE_ID}/finish`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: opts?.rawBody !== undefined ? opts.rawBody : JSON.stringify(body),
  });
}

function ctx(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

describe("POST /api/tutor/episodes/[id]/finish", () => {
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

  it("forwards a valid finish request and pipes the upstream 200 back", async () => {
    const upstreamBody = {
      episode_id: EPISODE_ID,
      final_outcome: "passed",
      time_to_solve_ms: 480_000,
      attempts: 1,
      hints_used: 0,
      skill_updates: [],
    };
    const fakeFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(upstreamBody), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    globalThis.fetch = fakeFetch as unknown as typeof fetch;

    const res = await POST(postRequest({}), ctx(EPISODE_ID));

    expect(res.status).toBe(200);
    const json = (await res.json()) as { final_outcome: string };
    expect(json.final_outcome).toBe("passed");
    expect(fakeFetch).toHaveBeenCalledWith(
      `http://api.test/v1/tutor/episodes/${EPISODE_ID}/finish`,
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

    await POST(postRequest({ outcome: "abandoned" }), ctx(EPISODE_ID));

    const call = fakeFetch.mock.calls[0]?.[1] as RequestInit | undefined;
    const headers = call?.headers as Record<string, string> | undefined;
    expect(headers?.["cookie"]).toBe("authjs.session-token=abc123");
  });

  it("accepts an empty body (treated as {})", async () => {
    const fakeFetch = vi
      .fn()
      .mockResolvedValue(
        new Response("{}", { status: 200, headers: { "content-type": "application/json" } }),
      );
    globalThis.fetch = fakeFetch as unknown as typeof fetch;

    const res = await POST(postRequest({}, { rawBody: "" }), ctx(EPISODE_ID));
    expect(res.status).toBe(200);
  });

  it("rejects an invalid outcome with 400", async () => {
    const res = await POST(postRequest({ outcome: "winning" }), ctx(EPISODE_ID));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("invalid_request");
  });

  it("rejects a non-UUID episode id with 400", async () => {
    const res = await POST(postRequest({}), ctx("not-a-uuid"));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("invalid_request");
  });

  it("returns 400 invalid_json when body is malformed", async () => {
    const req = new Request(`http://localhost/api/tutor/episodes/${EPISODE_ID}/finish`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });
    const res = await POST(req, ctx(EPISODE_ID));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("invalid_json");
  });

  it("returns 502 when the upstream fetch throws", async () => {
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new Error("connect ECONNREFUSED")) as unknown as typeof fetch;

    const res = await POST(postRequest({}), ctx(EPISODE_ID));
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

    const res = await POST(postRequest({ outcome: "abandoned" }), ctx(EPISODE_ID));
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe("illegal_transition");
  });
});
