import { describe, expect, it } from "vitest";
import { EmailChannel } from "./email-channel.js";
import { MockEmailTransport, NoopEmailTransport } from "./transport.js";

const USER_ID = "11111111-1111-1111-1111-111111111111";

describe("EmailChannel", () => {
  it("channel name is the literal 'email'", () => {
    const ch = new EmailChannel({ transport: new MockEmailTransport() });
    expect(ch.name).toBe("email");
  });

  it("returns delivered=false reason='missing_to' when no email_to is provided", async () => {
    const transport = new MockEmailTransport();
    const ch = new EmailChannel({ transport, log: () => {} });
    const out = await ch.send({ user_id: USER_ID, title: "x" });
    expect(out).toEqual({ delivered: false, reason: "missing_to" });
    expect(transport.sent).toHaveLength(0);
  });

  it("forwards email_to / email_html / email_text to the transport", async () => {
    const transport = new MockEmailTransport();
    const ch = new EmailChannel({ transport });
    const out = await ch.send({
      user_id: USER_ID,
      title: "Daily digest",
      metadata: {
        email_to: "test@example.com",
        email_html: "<p>HTML body</p>",
        email_text: "Text body",
      },
    });
    expect(out).toEqual({ delivered: true });
    expect(transport.sent).toHaveLength(1);
    const sent = transport.sent[0]!;
    expect(sent.to).toBe("test@example.com");
    expect(sent.subject).toBe("Daily digest");
    expect(sent.html).toBe("<p>HTML body</p>");
    expect(sent.text).toBe("Text body");
  });

  it("forwards email_headers verbatim to the transport (RFC 8058 unsubscribe headers)", async () => {
    const transport = new MockEmailTransport();
    const ch = new EmailChannel({ transport });
    await ch.send({
      user_id: USER_ID,
      title: "Daily digest",
      metadata: {
        email_to: "test@example.com",
        email_html: "<p>x</p>",
        email_text: "x",
        email_headers: {
          "List-Unsubscribe": "<https://learnpro.local/v1/email/unsubscribe?token=abc>",
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      },
    });
    const sent = transport.sent[0]!;
    expect(sent.headers).toEqual({
      "List-Unsubscribe": "<https://learnpro.local/v1/email/unsubscribe?token=abc>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
  });

  it("falls back to a minimal HTML body when email_html is absent", async () => {
    const transport = new MockEmailTransport();
    const ch = new EmailChannel({ transport });
    await ch.send({
      user_id: USER_ID,
      title: "Hello",
      body: "Body line",
      metadata: { email_to: "test@example.com" },
    });
    const sent = transport.sent[0]!;
    expect(sent.html).toContain("<h1>Hello</h1>");
    expect(sent.html).toContain("<p>Body line</p>");
    expect(sent.text).toContain("Hello");
    expect(sent.text).toContain("Body line");
  });

  it("escapes HTML special chars in the fallback body", async () => {
    const transport = new MockEmailTransport();
    const ch = new EmailChannel({ transport });
    await ch.send({
      user_id: USER_ID,
      title: "A <script>alert(1)</script>",
      metadata: { email_to: "test@example.com" },
    });
    const sent = transport.sent[0]!;
    expect(sent.html).not.toContain("<script>");
    expect(sent.html).toContain("&lt;script&gt;");
  });

  it("returns delivered=false with the transport's reason on a non-OK send", async () => {
    const transport = new MockEmailTransport();
    transport.nextResult = {
      delivered: false,
      provider_message_id: "",
      reason: "transient_5xx",
    };
    const ch = new EmailChannel({ transport, log: () => {} });
    const out = await ch.send({
      user_id: USER_ID,
      title: "x",
      metadata: { email_to: "test@example.com", email_html: "x", email_text: "x" },
    });
    expect(out).toEqual({ delivered: false, reason: "transient_5xx" });
  });

  it("swallows transport throws and returns reason='transport_threw'", async () => {
    const transport = new MockEmailTransport();
    transport.throwOnNextSend = new Error("boom");
    const ch = new EmailChannel({ transport, log: () => {} });
    const out = await ch.send({
      user_id: USER_ID,
      title: "x",
      metadata: { email_to: "test@example.com" },
    });
    expect(out).toEqual({ delivered: false, reason: "transport_threw" });
  });

  it("the noop transport reports unconfigured (matches the no-config production path)", async () => {
    const transport = new NoopEmailTransport();
    const ch = new EmailChannel({ transport, log: () => {} });
    const out = await ch.send({
      user_id: USER_ID,
      title: "x",
      metadata: { email_to: "test@example.com" },
    });
    expect(out).toEqual({ delivered: false, reason: "unconfigured" });
  });
});
