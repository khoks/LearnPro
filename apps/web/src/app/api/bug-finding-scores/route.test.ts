import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockHeaders } = vi.hoisted(() => ({ mockHeaders: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: mockHeaders,
}));

import { GET } from "./route";

describe("GET /api/bug-finding-scores (Next.js Route Handler)", () => {
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

  it("forwards a 200 response from upstream", async () => {
    const upstreamBody = {
      scores: [
        { bug_archetype: "off_by_one", score: 0.62, confidence: 0.5, attempts: 4 },
        { bug_archetype: "shadowing", score: 0.5, confidence: 0, attempts: 0 },
      ],
    };
    const fakeFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(upstreamBody), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    globalThis.fetch = fakeFetch as unknown as typeof fetch;

    const res = await GET();

    expect(res.status).toBe(200);
    const json = (await res.json()) as typeof upstreamBody;
    expect(json.scores).toHaveLength(2);
    expect(json.scores[0]?.bug_archetype).toBe("off_by_one");
    expect(fakeFetch).toHaveBeenCalledWith(
      "http://api.test/v1/bug-finding-scores",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("forwards the Auth.js session cookie upstream", async () => {
    const fakeFetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ scores: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    globalThis.fetch = fakeFetch as unknown as typeof fetch;

    await GET();

    const call = fakeFetch.mock.calls[0]?.[1] as RequestInit | undefined;
    const headers = call?.headers as Record<string, string> | undefined;
    expect(headers?.["cookie"]).toBe("authjs.session-token=abc123");
  });

  it("propagates upstream 401 unauthorized through unchanged", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    ) as unknown as typeof fetch;

    const res = await GET();
    expect(res.status).toBe(401);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("unauthorized");
  });

  it("returns 502 api_unreachable when fetch throws", async () => {
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new Error("ECONNREFUSED")) as unknown as typeof fetch;
    const res = await GET();
    expect(res.status).toBe(502);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("api_unreachable");
  });

  it("defaults LEARNPRO_API_URL to http://localhost:4000", async () => {
    delete process.env["LEARNPRO_API_URL"];
    const fakeFetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ scores: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ) as unknown as typeof fetch;
    globalThis.fetch = fakeFetch;
    await GET();
    expect(fakeFetch).toHaveBeenCalledWith(
      "http://localhost:4000/v1/bug-finding-scores",
      expect.any(Object),
    );
  });
});
