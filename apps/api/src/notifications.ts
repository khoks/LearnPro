import {
  addWebPushSubscription,
  listRecentNotifications,
  markAllRead,
  markRead,
  unreadCount,
  type LearnProDb,
} from "@learnpro/db";
import {
  NotificationDispatcher,
  QuietHoursDispatcher,
  TEST_PUSH_BODY,
  TEST_PUSH_TITLE,
} from "@learnpro/notifications";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { SessionResolver } from "./session.js";

// STORY-023 — bell-icon + Web Push HTTP routes. Wires the auth-gated panel queries +
// subscription lifecycle + test push. Every handler runs the cross-app session lookup; non-
// authenticated requests return 401. The dispatcher + DB are injected so tests don't need
// either.

const SubscribeBodySchema = z.object({
  endpoint: z.string().url().min(1).max(2000),
  keys: z.object({
    p256dh: z.string().min(1).max(200),
    auth: z.string().min(1).max(200),
  }),
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface NotificationsRouteOptions {
  db: LearnProDb;
  dispatcher: NotificationDispatcher | QuietHoursDispatcher;
  sessionResolver: SessionResolver;
  // The VAPID public key the browser uses when calling `pushManager.subscribe`. Public-key
  // material — safe to ship to the client. Empty string disables the subscribe + test-push
  // routes (returns 503) so the dev playground works without VAPID config.
  vapidPublicKey: string;
}

export function registerNotificationsRoutes(
  app: FastifyInstance,
  opts: NotificationsRouteOptions,
): void {
  const { db, dispatcher, sessionResolver, vapidPublicKey } = opts;

  // GET /v1/notifications/vapid-key — returns the public key. No auth: it's public material.
  app.get("/v1/notifications/vapid-key", async (_req, reply) => {
    if (!vapidPublicKey) {
      return reply
        .code(503)
        .send({ error: "vapid_unconfigured", message: "Web Push is not configured." });
    }
    return reply.code(200).send({ public_key: vapidPublicKey });
  });

  // GET /v1/notifications — recent + unread count for the bell-icon panel.
  app.get("/v1/notifications", async (req, reply) => {
    const session = await sessionResolver(req);
    if (!session) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const [items, unread] = await Promise.all([
      listRecentNotifications({ db, user_id: session.user_id }),
      unreadCount(db, session.user_id),
    ]);
    return reply.code(200).send({
      items: items.map((n) => ({
        id: n.id,
        channel: n.channel,
        title: n.title,
        body: n.body,
        sent_at: n.sent_at.toISOString(),
        read_at: n.read_at ? n.read_at.toISOString() : null,
      })),
      unread_count: unread,
    });
  });

  // POST /v1/notifications/:id/read — mark one as read; ownership-guarded inside markRead.
  app.post<{ Params: { id: string } }>("/v1/notifications/:id/read", async (req, reply) => {
    const session = await sessionResolver(req);
    if (!session) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const id = req.params.id;
    if (!UUID_RE.test(id)) {
      return reply.code(400).send({ error: "invalid_request", message: "id must be a UUID" });
    }
    const ok = await markRead({ db, notification_id: id, user_id: session.user_id });
    if (!ok) {
      return reply.code(404).send({ error: "not_found" });
    }
    return reply.code(200).send({ ok: true });
  });

  // POST /v1/notifications/read-all — flips every unread row.
  app.post("/v1/notifications/read-all", async (req, reply) => {
    const session = await sessionResolver(req);
    if (!session) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const flipped = await markAllRead({ db, user_id: session.user_id });
    return reply.code(200).send({ ok: true, flipped });
  });

  // POST /v1/notifications/subscribe — persist a Web Push subscription.
  app.post("/v1/notifications/subscribe", async (req, reply) => {
    if (!vapidPublicKey) {
      return reply
        .code(503)
        .send({ error: "vapid_unconfigured", message: "Web Push is not configured." });
    }
    const session = await sessionResolver(req);
    if (!session) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const parsed = SubscribeBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request", issues: parsed.error.issues });
    }
    const sub = await addWebPushSubscription({
      db,
      user_id: session.user_id,
      org_id: session.org_id,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
    });
    return reply.code(201).send({ id: sub.id });
  });

  // POST /v1/notifications/test-push — sends the test push to every browser the user has
  // subscribed. Routed through the dispatcher's web_push channel only — does NOT write a
  // bell-icon row (test pushes shouldn't pollute the panel).
  app.post("/v1/notifications/test-push", async (req, reply) => {
    if (!vapidPublicKey) {
      return reply
        .code(503)
        .send({ error: "vapid_unconfigured", message: "Web Push is not configured." });
    }
    const session = await sessionResolver(req);
    if (!session) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const outcome = await dispatcher.dispatch(
      {
        user_id: session.user_id,
        title: TEST_PUSH_TITLE,
        body: TEST_PUSH_BODY,
      },
      { channels: ["web_push"] },
    );
    const webResult = outcome.results.find((r) => r.channel === "web_push");
    if (!webResult || !webResult.delivered) {
      return reply.code(200).send({
        delivered: false,
        reason: webResult?.reason ?? "no_subscriptions",
      });
    }
    return reply.code(200).send({ delivered: true });
  });
}
