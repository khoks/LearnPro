import { getQuietHoursConfig, updateQuietHoursConfig, type LearnProDb } from "@learnpro/db";
import { QuietHoursConfigSchema } from "@learnpro/scoring";
import type { FastifyInstance } from "fastify";
import type { SessionResolver } from "./session.js";

// STORY-024 — settings GET/PUT routes for the user's quiet-hours config. Both auth-gated; PUT
// validates against the same Zod schema the policy uses, so the API rejects invalid IANA zones
// before they hit the DB.

export interface QuietHoursRouteOptions {
  db: LearnProDb;
  sessionResolver: SessionResolver;
}

export function registerQuietHoursRoutes(app: FastifyInstance, opts: QuietHoursRouteOptions): void {
  const { db, sessionResolver } = opts;

  app.get("/v1/settings/quiet-hours", async (req, reply) => {
    const session = await sessionResolver(req);
    if (!session) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const config = await getQuietHoursConfig(db, session.user_id);
    return reply.code(200).send(config);
  });

  app.put("/v1/settings/quiet-hours", async (req, reply) => {
    const session = await sessionResolver(req);
    if (!session) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const parsed = QuietHoursConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request", issues: parsed.error.issues });
    }
    await updateQuietHoursConfig({
      db,
      user_id: session.user_id,
      org_id: session.org_id,
      config: parsed.data,
    });
    return reply.code(200).send(parsed.data);
  });
}
