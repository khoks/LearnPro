import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

describe("GET /api/notifications/vapid-key (Next.js Route Handler)", () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    process.env["LEARNPRO_API_URL"] = "http://api.test";
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env["LEARNPRO_API_URL"];
  });

  it("forwards a 200 response from upstream", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ public_key: "BFakeKey" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ) as unknown as typeof fetch;
    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as { public_key: string };
    expect(json.public_key).toBe("BFakeKey");
  });

  it("propagates 503 vapid_unconfigured", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "vapid_unconfigured" }), {
        status: 503,
        headers: { "content-type": "application/json" },
      }),
    ) as unknown as typeof fetch;
    const res = await GET();
    expect(res.status).toBe(503);
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
      .mockResolvedValue(new Response("{}", { status: 200 })) as unknown as typeof fetch;
    globalThis.fetch = fakeFetch;
    await GET();
    expect(fakeFetch).toHaveBeenCalledWith(
      "http://localhost:4000/v1/notifications/vapid-key",
      expect.any(Object),
    );
  });
});
