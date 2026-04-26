import { describe, it, expect, vi } from "vitest";
import { runSandbox } from "./run-sandbox";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("runSandbox", () => {
  it("POSTs to /api/sandbox/run with the request body and returns the parsed result", async () => {
    const fakeFetch = vi.fn().mockResolvedValue(
      jsonResponse({
        stdout: "hello\n",
        stderr: "",
        exit_code: 0,
        duration_ms: 12,
        killed_by: null,
        language: "python",
        runtime_version: "3.10.0",
      }),
    );

    const out = await runSandbox(
      { language: "python", code: "print('hello')" },
      { fetchImpl: fakeFetch as unknown as typeof fetch },
    );

    expect(fakeFetch).toHaveBeenCalledWith(
      "/api/sandbox/run",
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json" },
      }),
    );
    const call = fakeFetch.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(call.body as string)).toEqual({
      language: "python",
      code: "print('hello')",
    });

    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.result.stdout).toBe("hello\n");
      expect(out.result.exit_code).toBe(0);
    }
  });

  it("returns ok:false with the upstream status and error code on a non-2xx response", async () => {
    const fakeFetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: "invalid_request", message: "bad code" }, 400));

    const out = await runSandbox(
      { language: "python", code: "" },
      { fetchImpl: fakeFetch as unknown as typeof fetch },
    );

    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.status).toBe(400);
      expect(out.error).toBe("invalid_request");
      expect(out.message).toBe("bad code");
    }
  });

  it("returns ok:false with error=network_error when fetch throws", async () => {
    const fakeFetch = vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED"));

    const out = await runSandbox(
      { language: "python", code: "print(1)" },
      { fetchImpl: fakeFetch as unknown as typeof fetch },
    );

    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.status).toBe(0);
      expect(out.error).toBe("network_error");
      expect(out.message).toBe("connect ECONNREFUSED");
    }
  });

  it("falls back to error=request_failed when the response body has no error field", async () => {
    const fakeFetch = vi.fn().mockResolvedValue(new Response("nope", { status: 502 }));

    const out = await runSandbox(
      { language: "python", code: "print(1)" },
      { fetchImpl: fakeFetch as unknown as typeof fetch },
    );

    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.status).toBe(502);
      expect(out.error).toBe("request_failed");
    }
  });
});
