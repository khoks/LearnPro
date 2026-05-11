# Self-hosting LearnPro: email setup

> Status: covers Resend ([STORY-045](../../project/stories/STORY-045-email-digests.md)) and Postmark ([STORY-045a](../../project/stories/STORY-045a-postmark-email-transport.md)) transports for the daily + weekly digest channel.

LearnPro sends two kinds of email — daily and weekly digests, both opt-in per user from `/settings/notifications`. Email is wired through the `EmailChannel` notification adapter and a swappable `EmailTransport` underneath. The transport is picked at boot time from environment variables.

If you don't configure a provider, the channel still loads — every send just no-ops via `NoopEmailTransport`. Your dispatcher chain stays stable, your crons keep running, and the bell-icon + Web Push channels are unaffected.

## Choosing a provider

| Provider | Free tier | Setup time | When to pick |
|---|---|---|---|
| Resend | 100 emails/day, 3,000/month | 5 min — domain DNS records | Default for most self-hosters. Best DX, fastest setup. |
| Postmark | 100 emails/month free trial; pay-as-you-go after | 10 min — verified sender domain | When you want Postmark's stricter transactional-only stance or already have a Postmark server. |
| (none) | n/a | 0 min | You don't want email — daily/weekly digests via in-app + Web Push only. |

Both providers cost approximately the same at low volumes (single-digit dollars per 10k transactional emails). Either is fine.

## Common env vars

These apply to whichever provider you pick:

```bash
LEARNPRO_EMAIL_PROVIDER=resend          # or "postmark" or "noop"
LEARNPRO_EMAIL_FROM="LearnPro <noreply@your-domain.example>"
LEARNPRO_PUBLIC_BASE_URL=https://your-public-host.example
```

`LEARNPRO_PUBLIC_BASE_URL` is what unsubscribe links and tracking pixels point at. It must be reachable from the public internet (this is the URL recipients see when they click "Unsubscribe").

## Option A: Resend

1. Sign up at https://resend.com (free).
2. Add and verify your sending domain — Resend will give you four DNS records (SPF, DKIM, DMARC, MX). Add them to your DNS provider; verification usually completes within a few minutes.
3. Create an API key under **API Keys → Create API Key** (use a "Sending access" scope; full access is not needed).
4. Set the env vars on the LearnPro **API server** and **the daily-reminder + weekly-digest crons**:

```bash
LEARNPRO_EMAIL_PROVIDER=resend
RESEND_API_KEY=re_xxxxxxxxxxxxxxxx
LEARNPRO_EMAIL_FROM="LearnPro <noreply@your-verified-domain.example>"
```

5. Restart the API server. The first daily-digest cron run after the next opt-in user will hit Resend.

Sandbox mode: Resend lets you send to verified addresses without a verified domain during development. Use the sandbox sender `onboarding@resend.dev` as `LEARNPRO_EMAIL_FROM` in dev and your own address as the recipient.

## Option B: Postmark

1. Sign up at https://postmarkapp.com.
2. Create a **Server** (one server = one isolated set of API tokens and an outbound stream). The default stream is **outbound** (transactional) — LearnPro's digests use this.
3. Add a **Sender Signature** for the domain you'll send from. Postmark requires either:
   - A verified signature on a specific email address (fastest), OR
   - DKIM + Return-Path verification on a full domain (recommended for digests so the unsubscribe footer aligns with the From domain).
4. Find your **Server API Token** under **Servers → \<your server\> → API Tokens**. (This is *not* the account-level token.)
5. Set the env vars on the API server and crons:

```bash
LEARNPRO_EMAIL_PROVIDER=postmark
POSTMARK_SERVER_TOKEN=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
LEARNPRO_EMAIL_FROM="LearnPro <noreply@your-verified-domain.example>"
```

6. Restart the API server.

Notes on Postmark's behaviour:

- Postmark has no permanent sandbox sender. Send fails with a 422 + `ErrorCode: 405` if your `From` address isn't a verified signature on that server.
- Postmark tracks each recipient's bounce/complaint state. If a recipient is marked "inactive", subsequent sends return 422 with `ErrorCode: 406`. LearnPro maps this to `delivered: false, reason: "bad_address"` — the daily / weekly cron continues and tries the rest of the recipient list.
- The transactional stream is rate-limited generously (300 emails/second on paid plans). Digest cron volume is comfortably below this for any self-hoster scale.

## Verifying it works

After setting env vars and restarting, you can fire the daily digest manually:

```bash
pnpm --filter @learnpro/api daily-reminder
```

Watch the logs. A successful send looks like:

```
[daily-digest] dispatched to 3 opted-in users; 3 delivered
```

A misconfigured provider shows up as:

```
[email] LEARNPRO_EMAIL_PROVIDER=postmark set but POSTMARK_SERVER_TOKEN or LEARNPRO_EMAIL_FROM missing — falling back to noop
[daily-digest] dispatched to 3 opted-in users; 0 delivered
```

The cron *does not* fail in the misconfigured case — it logs the warning, silently no-ops the email send, and the other channels (in-app + Web Push if configured) still deliver. This is intentional: an upstream email provider outage should not break the rest of the notification chain.

## Switching providers

You can change `LEARNPRO_EMAIL_PROVIDER` at any time. The crons read it on each invocation, so the next cron run uses the new provider. No code change, no rebuild.

Unsubscribed users carry over — `email_unsubscribe_token` lives in the `profiles` table independent of which provider sent the original email.

## Env-var matrix

| Var | Required for | Notes |
|---|---|---|
| `LEARNPRO_EMAIL_PROVIDER` | both | One of `resend` / `postmark` / `noop`. Case-insensitive. Unset → `noop`. |
| `LEARNPRO_EMAIL_FROM` | both | Verified sender. Use full RFC 5322 form (e.g. `"LearnPro <noreply@..>"`). |
| `LEARNPRO_PUBLIC_BASE_URL` | both | Public-facing URL the unsubscribe link points at. |
| `RESEND_API_KEY` | resend only | API key with sending scope. |
| `POSTMARK_SERVER_TOKEN` | postmark only | Server-level API token (not account-level). |
