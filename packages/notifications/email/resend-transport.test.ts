import { describe, expect, it, vi } from "vitest";
import { ResendTransport } from "./resend-transport.js";

function makeFetcher(handler: (url: string, init: RequestInit) => Promise<Response>): typeof fetch {
  return ((url: string | URL, init?: RequestInit) =>
    handler(typeof url === "string" ? url : url.toString(), init ?? {})) as unknown as typeof fetch;
}

const BASE_OPTS = {
  apiKey: "re_test_key",
  defaultFrom: "LearnPro <noreply@learnpro.local>",
  apiBase: "https://api.resend.test",
  log: () => {},
};

describe("ResendTransport", () => {
  it("constructor throws when apiKey is empty", () => {
    expect(() => new ResendTransport({ ...BASE_OPTS, apiKey: "" })).toThrow(/apiKey/);
  });

  it("constructor throws when defaultFrom is empty", () => {
    expect(() => new ResendTransport({ ...BASE_OPTS, defaultFrom: "" })).toThrow(/defaultFrom/);
  });

  it("posts to /emails with the bearer key + JSON body", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ id: "msg-abc" }), { status: 200 }));
    const t = new ResendTransport({ ...BASE_OPTS, fetcher: makeFetcher(fetcher) });
    const out = await t.send({
      to: "user@example.com",
      subject: "Daily digest",
      html: "<p>Hello</p>",
      text: "Hello",
    });
    expect(out).toEqual({ delivered: true, provider_message_id: "msg-abc" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe("https://api.resend.test/emails");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      "content-type": "application/json",
      authorization: "Bearer re_test_key",
    });
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.to).toBe("user@example.com");
    expect(body.subject).toBe("Daily digest");
    expect(body.html).toBe("<p>Hello</p>");
    expect(body.text).toBe("Hello");
    expect(body.from).toBe("LearnPro <noreply@learnpro.local>");
  });

  it("forwards optional headers + reply_to + per-send from override", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ id: "msg-1" }), { status: 200 }));
    const t = new ResendTransport({ ...BASE_OPTS, fetcher: makeFetcher(fetcher) });
    await t.send({
      to: "user@example.com",
      subject: "x",
      html: "x",
      text: "x",
      from: "override@learnpro.local",
      reply_to: "reply@learnpro.local",
      headers: {
        "List-Unsubscribe": "<https://learnpro.local/u?t=abc>",
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });
    const init = fetcher.mock.calls[0]![1];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.from).toBe("override@learnpro.local");
    expect(body.reply_to).toBe("reply@learnpro.local");
    expect(body.headers).toEqual({
      "List-Unsubscribe": "<https://learnpro.local/u?t=abc>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
  });

  it("returns delivered=false reason='auth_failed' on 401/403", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("", { status: 401 }));
    const t = new ResendTransport({ ...BASE_OPTS, fetcher: makeFetcher(fetcher) });
    const out = await t.send({ to: "u@example.com", subject: "x", html: "x", text: "x" });
    expect(out.delivered).toBe(false);
    expect(out.reason).toBe("auth_failed");
  });

  it("returns reason='rate_limited' on 429", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("", { status: 429 }));
    const t = new ResendTransport({ ...BASE_OPTS, fetcher: makeFetcher(fetcher) });
    const out = await t.send({ to: "u@example.com", subject: "x", html: "x", text: "x" });
    expect(out.reason).toBe("rate_limited");
  });

  it("returns reason='transient_5xx' on 503", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("", { status: 503 }));
    const t = new ResendTransport({ ...BASE_OPTS, fetcher: makeFetcher(fetcher) });
    const out = await t.send({ to: "u@example.com", subject: "x", html: "x", text: "x" });
    expect(out.reason).toBe("transient_5xx");
  });

  it("returns reason='bad_address' on 4xx (not 401/403/429)", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("", { status: 422 }));
    const t = new ResendTransport({ ...BASE_OPTS, fetcher: makeFetcher(fetcher) });
    const out = await t.send({ to: "bad", subject: "x", html: "x", text: "x" });
    expect(out.reason).toBe("bad_address");
  });

  it("returns reason='network_error' when fetch throws", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const t = new ResendTransport({ ...BASE_OPTS, fetcher: makeFetcher(fetcher) });
    const out = await t.send({ to: "u@example.com", subject: "x", html: "x", text: "x" });
    expect(out.reason).toBe("network_error");
  });

  it("returns reason='malformed_response' when the body is missing the id field", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ unrelated: true }), { status: 200 }));
    const t = new ResendTransport({ ...BASE_OPTS, fetcher: makeFetcher(fetcher) });
    const out = await t.send({ to: "u@example.com", subject: "x", html: "x", text: "x" });
    expect(out.reason).toBe("malformed_response");
  });
});
