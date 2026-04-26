import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/sandbox/run", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/sandbox/run (Next.js Route Handler)", () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    process.env["LEARNPRO_API_URL"] = "http://api.test";
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env["LEARNPRO_API_URL"];
  });

  it("forwards a valid request to the API and returns the upstream response", async () => {
    const upstreamBody = JSON.stringify({
      stdout: "hi\n",
      stderr: "",
      exit_code: 0,
      duration_ms: 7,
      killed_by: null,
      language: "python",
      runtime_version: "3.10.0",
    });
    const fakeFetch = vi.fn().mockResolvedValue(
      new Response(upstreamBody, {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    globalThis.fetch = fakeFetch as unknown as typeof fetch;

    const res = await POST(postRequest({ language: "python", code: "print('hi')" }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.stdout).toBe("hi\n");
    expect(fakeFetch).toHaveBeenCalledWith(
      "http://api.test/sandbox/run",
      expect.objectContaining({ method: "POST" }),
    );
    const fwBody = JSON.parse(
      (fakeFetch.mock.calls[0]?.[1] as RequestInit).body as string,
    ) as Record<string, unknown>;
    expect(fwBody["language"]).toBe("python");
    expect(fwBody["code"]).toBe("print('hi')");
  });

  it("returns 400 with error=invalid_json when the body is not JSON", async () => {
    const req = new Request("http://localhost/api/sandbox/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("invalid_json");
  });

  it("returns 400 with error=invalid_request when the body fails zod validation", async () => {
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

  it("propagates upstream non-2xx status codes through to the client", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "sandbox_unavailable", message: "piston down" }), {
        status: 502,
        headers: { "content-type": "application/json" },
      }),
    ) as unknown as typeof fetch;

    const res = await POST(postRequest({ language: "python", code: "print(1)" }));
    expect(res.status).toBe(502);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("sandbox_unavailable");
  });

  it("defaults to http://localhost:4000 when LEARNPRO_API_URL is unset", async () => {
    delete process.env["LEARNPRO_API_URL"];
    const fakeFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          stdout: "ok",
          stderr: "",
          exit_code: 0,
          duration_ms: 1,
          killed_by: null,
          language: "python",
          runtime_version: "3.10.0",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    globalThis.fetch = fakeFetch as unknown as typeof fetch;

    await POST(postRequest({ language: "python", code: "print(1)" }));
    expect(fakeFetch).toHaveBeenCalledWith("http://localhost:4000/sandbox/run", expect.any(Object));
  });
});
