import { z } from "zod";
import type { EmailMessage, EmailSendResult, EmailTransport } from "./transport.js";

// STORY-045 — Resend adapter for the email digest channel. Hits Resend's REST API directly
// (one POST to /emails) so we don't pull in the full `resend` npm SDK as a runtime dep — the
// SDK adds ~140KB and a bunch of features we don't need for digests. The wire format is small
// and stable: see https://resend.com/docs/api-reference/emails/send-email.
//
// The transport returns `{ delivered: false }` (logging the reason) on transient 5xx / network
// errors so the EmailChannel can record the per-channel outcome and the dispatcher moves on.
// Programmer errors (missing API key) throw because they indicate a deployment misconfiguration.

const ResendSendResponseSchema = z.object({
  id: z.string().min(1),
});

export interface ResendTransportOptions {
  apiKey: string;
  // The verified sender address Resend uses as the `From` header by default. Operators set this
  // to a domain they've added to Resend; in dev a verified onboarding sandbox sender works.
  defaultFrom: string;
  // Test seam — production uses globalThis.fetch.
  fetcher?: typeof fetch;
  // Test seam — production uses console.warn.
  log?: (msg: string, meta?: Record<string, unknown>) => void;
  // Override the API base; defaults to https://api.resend.com.
  apiBase?: string;
}

const DEFAULT_API_BASE = "https://api.resend.com";

export class ResendTransport implements EmailTransport {
  readonly name = "resend" as const;
  private readonly apiKey: string;
  private readonly defaultFrom: string;
  private readonly fetcher: typeof fetch;
  private readonly log: (msg: string, meta?: Record<string, unknown>) => void;
  private readonly apiBase: string;

  constructor(opts: ResendTransportOptions) {
    if (!opts.apiKey) {
      throw new Error("ResendTransport: apiKey is required");
    }
    if (!opts.defaultFrom) {
      throw new Error("ResendTransport: defaultFrom is required");
    }
    this.apiKey = opts.apiKey;
    this.defaultFrom = opts.defaultFrom;
    this.fetcher = opts.fetcher ?? globalThis.fetch.bind(globalThis);
    this.log = opts.log ?? ((msg, meta) => console.warn(msg, meta ?? {}));
    this.apiBase = opts.apiBase ?? DEFAULT_API_BASE;
  }

  async send(msg: EmailMessage): Promise<EmailSendResult> {
    const body = {
      from: msg.from ?? this.defaultFrom,
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      ...(msg.reply_to !== undefined && { reply_to: msg.reply_to }),
      ...(msg.headers !== undefined && { headers: msg.headers }),
    };
    let res: Response;
    try {
      res = await this.fetcher(`${this.apiBase}/emails`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      this.log("[resend] network error", {
        err: err instanceof Error ? err.message : String(err),
      });
      return { delivered: false, provider_message_id: "", reason: "network_error" };
    }

    if (res.status === 401 || res.status === 403) {
      this.log("[resend] auth failed", { status: res.status });
      return { delivered: false, provider_message_id: "", reason: "auth_failed" };
    }
    if (res.status === 429) {
      this.log("[resend] rate limited", { status: res.status });
      return { delivered: false, provider_message_id: "", reason: "rate_limited" };
    }
    if (res.status >= 500) {
      this.log("[resend] transient 5xx", { status: res.status });
      return { delivered: false, provider_message_id: "", reason: "transient_5xx" };
    }
    if (res.status >= 400) {
      // 4xx on email send is usually a bad address. Don't retry.
      this.log("[resend] bad request", { status: res.status });
      return { delivered: false, provider_message_id: "", reason: "bad_address" };
    }

    let parsed: { id: string };
    try {
      const raw = await res.json();
      parsed = ResendSendResponseSchema.parse(raw);
    } catch (err) {
      this.log("[resend] malformed response", {
        err: err instanceof Error ? err.message : String(err),
      });
      return { delivered: false, provider_message_id: "", reason: "malformed_response" };
    }
    return { delivered: true, provider_message_id: parsed.id };
  }
}
