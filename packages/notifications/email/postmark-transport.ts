import { z } from "zod";
import type { EmailMessage, EmailSendResult, EmailTransport } from "./transport.js";

// STORY-045a — Postmark adapter for the email digest channel. Hits Postmark's REST API directly
// (one POST to /email) so we don't pull in the `postmark` npm SDK as a runtime dep — keeps the
// runtime surface small for self-hosters and matches the REST-only stance the Resend adapter
// took for the same reason. Wire format: https://postmarkapp.com/developer/api/email-api.
//
// The transport mirrors `ResendTransport`'s contract — same `{ delivered, provider_message_id,
// reason }` result, same coarse error-mapping (4xx → bad-address / auth / rate-limit; 5xx →
// transient; network failure → swallow + log). Programmer errors (missing API token) throw at
// construction because they indicate a deployment misconfiguration.

// Success response: { To, SubmittedAt, MessageID: uuid, ErrorCode: 0, Message: "OK" }.
// We only surface MessageID — the rest is parsed loosely.
const PostmarkSendResponseSchema = z.object({
  MessageID: z.string().min(1),
});

// Failure response shape (Postmark returns 4xx with a JSON body). We don't currently branch on
// ErrorCode beyond the HTTP-status mapping, but parsing it lets us log the cause cleanly.
const PostmarkErrorResponseSchema = z.object({
  ErrorCode: z.number(),
  Message: z.string(),
});

export interface PostmarkTransportOptions {
  serverToken: string;
  // The verified sender address Postmark uses as the `From` header by default. Operators set this
  // to an address whose domain is verified in their Postmark server. Postmark has no sandbox
  // sender — the domain must be DKIM/Return-Path-verified before sends will succeed.
  defaultFrom: string;
  // Test seam — production uses globalThis.fetch.
  fetcher?: typeof fetch;
  // Test seam — production uses console.warn.
  log?: (msg: string, meta?: Record<string, unknown>) => void;
  // Override the API base; defaults to https://api.postmarkapp.com.
  apiBase?: string;
}

const DEFAULT_API_BASE = "https://api.postmarkapp.com";

export class PostmarkTransport implements EmailTransport {
  readonly name = "postmark" as const;
  private readonly serverToken: string;
  private readonly defaultFrom: string;
  private readonly fetcher: typeof fetch;
  private readonly log: (msg: string, meta?: Record<string, unknown>) => void;
  private readonly apiBase: string;

  constructor(opts: PostmarkTransportOptions) {
    if (!opts.serverToken) {
      throw new Error("PostmarkTransport: serverToken is required");
    }
    if (!opts.defaultFrom) {
      throw new Error("PostmarkTransport: defaultFrom is required");
    }
    this.serverToken = opts.serverToken;
    this.defaultFrom = opts.defaultFrom;
    this.fetcher = opts.fetcher ?? globalThis.fetch.bind(globalThis);
    this.log = opts.log ?? ((msg, meta) => console.warn(msg, meta ?? {}));
    this.apiBase = opts.apiBase ?? DEFAULT_API_BASE;
  }

  async send(msg: EmailMessage): Promise<EmailSendResult> {
    // Postmark's headers are an array of { Name, Value } objects rather than a plain map — the
    // EmailChannel passes a plain `Record<string, string>` so we translate at the boundary.
    const headersArr =
      msg.headers !== undefined
        ? Object.entries(msg.headers).map(([Name, Value]) => ({ Name, Value }))
        : undefined;
    const body: Record<string, unknown> = {
      From: msg.from ?? this.defaultFrom,
      To: msg.to,
      Subject: msg.subject,
      HtmlBody: msg.html,
      TextBody: msg.text,
    };
    if (msg.reply_to !== undefined) {
      body["ReplyTo"] = msg.reply_to;
    }
    if (headersArr !== undefined) {
      body["Headers"] = headersArr;
    }

    let res: Response;
    try {
      res = await this.fetcher(`${this.apiBase}/email`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          "x-postmark-server-token": this.serverToken,
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      this.log("[postmark] network error", {
        err: err instanceof Error ? err.message : String(err),
      });
      return { delivered: false, provider_message_id: "", reason: "network_error" };
    }

    if (res.status === 401 || res.status === 403) {
      const detail = await tryParseError(res);
      this.log("[postmark] auth failed", { status: res.status, detail });
      return { delivered: false, provider_message_id: "", reason: "auth_failed" };
    }
    if (res.status === 429) {
      this.log("[postmark] rate limited", { status: res.status });
      return { delivered: false, provider_message_id: "", reason: "rate_limited" };
    }
    if (res.status >= 500) {
      this.log("[postmark] transient 5xx", { status: res.status });
      return { delivered: false, provider_message_id: "", reason: "transient_5xx" };
    }
    if (res.status >= 400) {
      // 4xx on email send is usually a bad address or unverified sender. Don't retry.
      const detail = await tryParseError(res);
      this.log("[postmark] bad request", { status: res.status, detail });
      return { delivered: false, provider_message_id: "", reason: "bad_address" };
    }

    let parsed: { MessageID: string };
    try {
      const raw = await res.json();
      parsed = PostmarkSendResponseSchema.parse(raw);
    } catch (err) {
      this.log("[postmark] malformed response", {
        err: err instanceof Error ? err.message : String(err),
      });
      return { delivered: false, provider_message_id: "", reason: "malformed_response" };
    }
    return { delivered: true, provider_message_id: parsed.MessageID };
  }
}

async function tryParseError(res: Response): Promise<{ code: number; message: string } | null> {
  try {
    const raw = await res.json();
    const parsed = PostmarkErrorResponseSchema.parse(raw);
    return { code: parsed.ErrorCode, message: parsed.Message };
  } catch {
    return null;
  }
}
