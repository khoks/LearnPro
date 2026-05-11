import {
  NoopEmailTransport,
  PostmarkTransport,
  ResendTransport,
  type EmailTransport,
} from "@learnpro/notifications/email";

// STORY-045 / STORY-045a — picks the email transport based on LEARNPRO_EMAIL_PROVIDER.
//
//   resend    → RESEND_API_KEY + LEARNPRO_EMAIL_FROM
//   postmark  → POSTMARK_SERVER_TOKEN + LEARNPRO_EMAIL_FROM
//   (other)   → noop
//
// Missing credentials for the configured provider falls back to `NoopEmailTransport` so the
// dispatcher chain is stable across "email not configured" deploys (e.g. self-hosters who
// haven't set up SMTP yet). The optional `log` seam is for the cron entry points that want a
// visible warning when the provider is set but the credentials are absent.

export interface BuildEmailTransportOptions {
  env?: NodeJS.ProcessEnv;
  log?: (msg: string) => void;
}

export function buildEmailTransportFromEnv(opts: BuildEmailTransportOptions = {}): EmailTransport {
  const env = opts.env ?? process.env;
  const log = opts.log;
  const provider = (env["LEARNPRO_EMAIL_PROVIDER"] ?? "noop").toLowerCase();

  if (provider === "resend") {
    const apiKey = env["RESEND_API_KEY"];
    const defaultFrom = env["LEARNPRO_EMAIL_FROM"];
    if (!apiKey || !defaultFrom) {
      log?.(
        "[email] LEARNPRO_EMAIL_PROVIDER=resend set but RESEND_API_KEY or LEARNPRO_EMAIL_FROM missing — falling back to noop",
      );
      return new NoopEmailTransport();
    }
    return new ResendTransport({ apiKey, defaultFrom });
  }

  if (provider === "postmark") {
    const serverToken = env["POSTMARK_SERVER_TOKEN"];
    const defaultFrom = env["LEARNPRO_EMAIL_FROM"];
    if (!serverToken || !defaultFrom) {
      log?.(
        "[email] LEARNPRO_EMAIL_PROVIDER=postmark set but POSTMARK_SERVER_TOKEN or LEARNPRO_EMAIL_FROM missing — falling back to noop",
      );
      return new NoopEmailTransport();
    }
    return new PostmarkTransport({ serverToken, defaultFrom });
  }

  return new NoopEmailTransport();
}
