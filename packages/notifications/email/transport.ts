// STORY-045 — Email transport seam. The `EmailChannel` accepts any object satisfying this
// interface; production wires the Resend adapter (`./resend-transport.ts`) and tests inject a
// `MockEmailTransport` so unit tests never hit the wire.
//
// `metadata.headers` lets the digest builders pass through RFC 8058 `List-Unsubscribe` /
// `List-Unsubscribe-Post` headers — the channel sets them on every send.

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  // Optional headers — the email channel uses this to attach `List-Unsubscribe` /
  // `List-Unsubscribe-Post` per RFC 8058. Transports are expected to forward them verbatim.
  headers?: Record<string, string>;
  // Reply-to / from override per-send. The transport's default `from` address is used otherwise.
  from?: string;
  reply_to?: string;
}

export interface EmailSendResult {
  delivered: boolean;
  // The provider's message id when delivered. Empty string on failure (callers shouldn't rely on
  // it for failure paths).
  provider_message_id: string;
  // When `delivered` is false, why. Common values: `transient_5xx`, `bad_address`,
  // `auth_failed`, `rate_limited`, `network_error`, `unconfigured`.
  reason?: string;
}

export interface EmailTransport {
  readonly name: "resend" | "postmark" | "mock" | "noop";
  send(msg: EmailMessage): Promise<EmailSendResult>;
}

// A transport whose `send` always succeeds and records every call. Drives unit tests for the
// EmailChannel + the cron wiring.
export class MockEmailTransport implements EmailTransport {
  readonly name = "mock" as const;
  public sent: EmailMessage[] = [];
  public nextResult: EmailSendResult | null = null;
  public throwOnNextSend: Error | null = null;

  async send(msg: EmailMessage): Promise<EmailSendResult> {
    if (this.throwOnNextSend) {
      const err = this.throwOnNextSend;
      this.throwOnNextSend = null;
      throw err;
    }
    this.sent.push(msg);
    if (this.nextResult) {
      const r = this.nextResult;
      this.nextResult = null;
      return r;
    }
    return { delivered: true, provider_message_id: `mock-${this.sent.length}` };
  }
}

// A transport that swallows every send. Used as the default when no email provider is
// configured — the EmailChannel still exists in the dispatcher chain but every send is a no-op
// rather than a hard failure.
export class NoopEmailTransport implements EmailTransport {
  readonly name = "noop" as const;
  async send(): Promise<EmailSendResult> {
    return { delivered: false, provider_message_id: "", reason: "unconfigured" };
  }
}
