import {
  EmailDigestPrefsSchema,
  getEmailDigestPrefs,
  unsubscribeByToken,
  updateEmailDigestPrefs,
  type LearnProDb,
} from "@learnpro/db";
import {
  UNSUBSCRIBE_SUCCESS_BODY,
  UNSUBSCRIBE_SUCCESS_TITLE,
  UNSUBSCRIBE_UNKNOWN_BODY,
  UNSUBSCRIBE_UNKNOWN_TITLE,
} from "@learnpro/notifications/email";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { SessionResolver } from "./session.js";

// STORY-045 — Two routes:
//
//   - GET / PUT /v1/settings/email-digest — auth-gated; backs the settings UI.
//   - GET /v1/email/unsubscribe?token=... — unauthenticated; the link lands here from every
//     digest email. Flips both opt-ins to false and returns a friendly HTML page (RFC 8058
//     also requires this to accept POST for one-click; we add the POST handler too).

export interface EmailDigestRouteOptions {
  db: LearnProDb;
  sessionResolver: SessionResolver;
}

export function registerEmailDigestRoutes(
  app: FastifyInstance,
  opts: EmailDigestRouteOptions,
): void {
  const { db, sessionResolver } = opts;

  app.get("/v1/settings/email-digest", async (req, reply) => {
    const session = await sessionResolver(req);
    if (!session) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const prefs = await getEmailDigestPrefs(db, session.user_id);
    return reply.code(200).send({
      daily_opt_in: prefs.daily_opt_in,
      weekly_opt_in: prefs.weekly_opt_in,
      weekly_day_of_week: prefs.weekly_day_of_week,
    });
  });

  app.put("/v1/settings/email-digest", async (req, reply) => {
    const session = await sessionResolver(req);
    if (!session) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const parsed = EmailDigestPrefsSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request", issues: parsed.error.issues });
    }
    const next = await updateEmailDigestPrefs({
      db,
      user_id: session.user_id,
      org_id: session.org_id,
      prefs: parsed.data,
    });
    return reply.code(200).send({
      daily_opt_in: next.daily_opt_in,
      weekly_opt_in: next.weekly_opt_in,
      weekly_day_of_week: next.weekly_day_of_week,
    });
  });

  // RFC 8058 / one-click unsubscribe. The GET form is the link target inside emails; the POST
  // form is fired by mail clients (Gmail, Outlook) when the user clicks the inbox-level
  // unsubscribe button. Both flip the opt-ins to false and render the same success page; POST
  // returns 200 OK with no body (per the spec — Gmail just expects 2xx).
  const TokenQuerySchema = z.object({ token: z.string().min(1).max(256) });

  app.get("/v1/email/unsubscribe", async (req, reply) => {
    const parsed = TokenQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply
        .header("content-type", "text/html; charset=utf-8")
        .code(400)
        .send(renderUnsubscribePage(UNSUBSCRIBE_UNKNOWN_TITLE, UNSUBSCRIBE_UNKNOWN_BODY));
    }
    const result = await unsubscribeByToken(db, parsed.data.token);
    const title = result.found ? UNSUBSCRIBE_SUCCESS_TITLE : UNSUBSCRIBE_UNKNOWN_TITLE;
    const body = result.found ? UNSUBSCRIBE_SUCCESS_BODY : UNSUBSCRIBE_UNKNOWN_BODY;
    return reply
      .header("content-type", "text/html; charset=utf-8")
      .code(200)
      .send(renderUnsubscribePage(title, body));
  });

  app.post("/v1/email/unsubscribe", async (req, reply) => {
    const parsed = TokenQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request" });
    }
    await unsubscribeByToken(db, parsed.data.token);
    return reply.code(200).send({ ok: true });
  });
}

function renderUnsubscribePage(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{font-family:-apple-system,system-ui,Segoe UI,sans-serif;margin:0;padding:48px 16px;background:#f7f7f8;color:#222;}
main{max-width:520px;margin:0 auto;background:#fff;border:1px solid #eee;border-radius:8px;padding:32px;}
h1{margin:0 0 12px;font-size:20px;}
p{margin:0;color:#444;line-height:1.5;}
</style>
</head>
<body>
<main>
<h1>${escapeHtml(title)}</h1>
<p>${escapeHtml(body)}</p>
</main>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
