import type {
  NotificationChannel,
  NotificationChannelName,
  NotificationDeliveryResult,
  NotificationInput,
} from "../src/channel.js";
import type { EmailTransport } from "./transport.js";

// STORY-045 — `EmailChannel` implements the `NotificationChannel` contract from STORY-023.
// Adding email is mechanical: the dispatcher's fan-out doesn't change, the channel just gets
// added to the channel list.
//
// Inputs unique to email — recipient address, subject/body html/text, optional headers — flow
// through `NotificationInput.metadata`:
//
//   metadata.email_to        — REQUIRED. The recipient address (the channel skips the send
//                              with reason="missing_to" if absent).
//   metadata.email_html      — optional. Pre-rendered HTML body; falls back to text-only.
//   metadata.email_text      — optional. Plain-text alternative.
//   metadata.email_headers   — optional. Headers passed verbatim to the transport. The cron
//                              wires `List-Unsubscribe` + `List-Unsubscribe-Post` here per
//                              RFC 8058.
//
// The fallback when html/text aren't present is to compose a minimal body from the dispatcher's
// `title` + `body`. That's fine for non-digest dispatches (e.g. a future "concept mastered"
// nudge) but the digests always pass pre-rendered html/text.
//
// Like `WebPushChannel`, transient failures are *swallowed*: the channel returns
// `{ delivered: false; reason }` and the dispatcher records the per-channel result. The error
// path never throws.

export interface EmailChannelOptions {
  transport: EmailTransport;
  log?: (msg: string, meta?: Record<string, unknown>) => void;
}

export class EmailChannel implements NotificationChannel {
  readonly name: NotificationChannelName = "email";
  private readonly transport: EmailTransport;
  private readonly log: (msg: string, meta?: Record<string, unknown>) => void;

  constructor(opts: EmailChannelOptions) {
    this.transport = opts.transport;
    this.log = opts.log ?? ((msg, meta) => console.warn(msg, meta ?? {}));
  }

  async send(input: NotificationInput): Promise<NotificationDeliveryResult> {
    const meta = input.metadata ?? {};
    const to = pickString(meta["email_to"]);
    if (!to) {
      return { delivered: false, reason: "missing_to" };
    }
    const html = pickString(meta["email_html"]) ?? fallbackHtml(input);
    const text = pickString(meta["email_text"]) ?? fallbackText(input);
    const headers = pickHeaders(meta["email_headers"]);
    const from = pickString(meta["email_from"]);
    const replyTo = pickString(meta["email_reply_to"]);

    try {
      const result = await this.transport.send({
        to,
        subject: input.title,
        html,
        text,
        ...(headers !== undefined && { headers }),
        ...(from !== undefined && { from }),
        ...(replyTo !== undefined && { reply_to: replyTo }),
      });
      if (result.delivered) {
        return { delivered: true };
      }
      return { delivered: false, reason: result.reason ?? "send_failed" };
    } catch (err) {
      this.log("[email] transport threw", {
        err: err instanceof Error ? err.message : String(err),
      });
      return { delivered: false, reason: "transport_threw" };
    }
  }
}

function pickString(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function pickHeaders(v: unknown): Record<string, string> | undefined {
  if (!v || typeof v !== "object") return undefined;
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v)) {
    if (typeof val === "string") out[k] = val;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function fallbackHtml(input: NotificationInput): string {
  const safeTitle = escapeHtml(input.title);
  const safeBody = input.body ? escapeHtml(input.body) : "";
  return `<!doctype html><html><body><h1>${safeTitle}</h1>${safeBody ? `<p>${safeBody}</p>` : ""}</body></html>`;
}

function fallbackText(input: NotificationInput): string {
  return input.body ? `${input.title}\n\n${input.body}` : input.title;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
