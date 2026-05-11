import { describe, expect, it, vi } from "vitest";
import { PostmarkTransport } from "./postmark-transport.js";

function makeFetcher(handler: (url: string, init: RequestInit) => Promise<Response>): typeof fetch {
  return ((url: string | URL, init?: RequestInit) =>
    handler(typeof url === "string" ? url : url.toString(), init ?? {})) as unknown as typeof fetch;
}

const BASE_OPTS = {
  serverToken: "pm_test_token",
  defaultFrom: "LearnPro <noreply@learnpro.local>",
  apiBase: "https://api.postmark.test",
  log: () => {},
};

describe("PostmarkTransport", () => {
  it("constructor throws when serverToken is empty", () => {
    expect(() => new PostmarkTransport({ ...BASE_OPTS, serverToken: "" })).toThrow(/serverToken/);
  });

  it("constructor throws when defaultFrom is empty", () => {
    expect(() => new PostmarkTransport({ ...BASE_OPTS, defaultFrom: "" })).toThrow(/defaultFrom/);
  });

  it("posts to /email with the X-Postmark-Server-Token header + JSON body in Postmark's PascalCase shape", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          MessageID: "msg-abc-uuid",
          To: "user@example.com",
          SubmittedAt: "2026-05-11T00:00:00Z",
          ErrorCode: 0,
          Message: "OK",
        }),
        { status: 200 },
      ),
    );
    const t = new PostmarkTransport({ ...BASE_OPTS, fetcher: makeFetcher(fetcher) });
    const out = await t.send({
      to: "user@example.com",
      subject: "Daily digest",
      html: "<p>Hello</p>",
      text: "Hello",
    });
    expect(out).toEqual({ delivered: true, provider_message_id: "msg-abc-uuid" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe("https://api.postmark.test/email");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      "content-type": "application/json",
      accept: "application/json",
      "x-postmark-server-token": "pm_test_token",
    });
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.To).toBe("user@example.com");
    expect(body.Subject).toBe("Daily digest");
    expect(body.HtmlBody).toBe("<p>Hello</p>");
    expect(body.TextBody).toBe("Hello");
    expect(body.From).toBe("LearnPro <noreply@learnpro.local>");
  });

  it("translates EmailMessage.headers (plain map) to Postmark's [{Name, Value}] array shape, and forwards reply_to + per-send from override", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ MessageID: "msg-1" }), { status: 200 }));
    const t = new PostmarkTransport({ ...BASE_OPTS, fetcher: makeFetcher(fetcher) });
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
    expect(body.From).toBe("override@learnpro.local");
    expect(body.ReplyTo).toBe("reply@learnpro.local");
    expect(body.Headers).toEqual([
      { Name: "List-Unsubscribe", Value: "<https://learnpro.local/u?t=abc>" },
      { Name: "List-Unsubscribe-Post", Value: "List-Unsubscribe=One-Click" },
    ]);
  });

  it("returns delivered=false reason='auth_failed' on 401 and parses Postmark's {ErrorCode, Message} error body", async () => {
    const logCalls: { msg: string; meta?: Record<string, unknown> }[] = [];
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ErrorCode: 10,
          Message: "Invalid server token",
        }),
        { status: 401 },
      ),
    );
    const t = new PostmarkTransport({
      ...BASE_OPTS,
      fetcher: makeFetcher(fetcher),
      log: (msg, meta) => logCalls.push({ msg, meta }),
    });
    const out = await t.send({ to: "u@example.com", subject: "x", html: "x", text: "x" });
    expect(out.delivered).toBe(false);
    expect(out.reason).toBe("auth_failed");
    // The Postmark-specific error body was parsed and surfaced in the log meta.
    expect(logCalls.length).toBe(1);
    expect(logCalls[0]!.msg).toMatch(/auth failed/);
    expect(logCalls[0]!.meta).toMatchObject({
      status: 401,
      detail: { code: 10, message: "Invalid server token" },
    });
  });

  it("returns reason='rate_limited' on 429", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("", { status: 429 }));
    const t = new PostmarkTransport({ ...BASE_OPTS, fetcher: makeFetcher(fetcher) });
    const out = await t.send({ to: "u@example.com", subject: "x", html: "x", text: "x" });
    expect(out.reason).toBe("rate_limited");
  });

  it("returns reason='transient_5xx' on 503", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("", { status: 503 }));
    const t = new PostmarkTransport({ ...BASE_OPTS, fetcher: makeFetcher(fetcher) });
    const out = await t.send({ to: "u@example.com", subject: "x", html: "x", text: "x" });
    expect(out.reason).toBe("transient_5xx");
  });

  it("returns reason='bad_address' on 422 (Postmark's 'inactive recipient' / unverified-sender path) and surfaces ErrorCode in the log", async () => {
    const logCalls: { msg: string; meta?: Record<string, unknown> }[] = [];
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ErrorCode: 406,
          Message: "You tried to send to a recipient that has been marked as inactive.",
        }),
        { status: 422 },
      ),
    );
    const t = new PostmarkTransport({
      ...BASE_OPTS,
      fetcher: makeFetcher(fetcher),
      log: (msg, meta) => logCalls.push({ msg, meta }),
    });
    const out = await t.send({ to: "bad", subject: "x", html: "x", text: "x" });
    expect(out.reason).toBe("bad_address");
    expect(logCalls[0]!.meta).toMatchObject({
      status: 422,
      detail: { code: 406 },
    });
  });

  it("returns reason='network_error' when fetch throws", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const t = new PostmarkTransport({ ...BASE_OPTS, fetcher: makeFetcher(fetcher) });
    const out = await t.send({ to: "u@example.com", subject: "x", html: "x", text: "x" });
    expect(out.reason).toBe("network_error");
  });

  it("returns reason='malformed_response' when the success body is missing MessageID", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ ErrorCode: 0, Message: "OK" }), { status: 200 }),
      );
    const t = new PostmarkTransport({ ...BASE_OPTS, fetcher: makeFetcher(fetcher) });
    const out = await t.send({ to: "u@example.com", subject: "x", html: "x", text: "x" });
    expect(out.reason).toBe("malformed_response");
  });

  it("tolerates a 4xx response whose body is not the Postmark error shape (no throw, still bad_address)", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("plaintext body", { status: 422 }));
    const t = new PostmarkTransport({ ...BASE_OPTS, fetcher: makeFetcher(fetcher) });
    const out = await t.send({ to: "u@example.com", subject: "x", html: "x", text: "x" });
    expect(out.reason).toBe("bad_address");
  });

  it("exposes name='postmark' for dispatcher-side logging + outcome attribution", () => {
    const t = new PostmarkTransport(BASE_OPTS);
    expect(t.name).toBe("postmark");
  });
});
