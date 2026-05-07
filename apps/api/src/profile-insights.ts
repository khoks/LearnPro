import { getInsightTelemetry, listLatestInsights, type LearnProDb } from "@learnpro/db";
import type { FastifyInstance } from "fastify";
import type { SessionResolver } from "./session.js";

// STORY-033 — `GET /v1/profile-insights` exposes the user's latest cross-episode insights and
// telemetry (active count + average referenced_count). Powers the dashboard card and AC #5
// telemetry surface. Auth-gated; anonymous returns 401.
//
// Limit defaults to 5 (the dashboard shows 3, but a future "see all" view might want more).
// The route caps at 20 to keep the response small.

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;

export interface ProfileInsightsRouteOptions {
  db: LearnProDb;
  sessionResolver: SessionResolver;
}

export function registerProfileInsightsRoutes(
  app: FastifyInstance,
  opts: ProfileInsightsRouteOptions,
): void {
  const { db, sessionResolver } = opts;

  app.get<{ Querystring: { limit?: string } }>("/v1/profile-insights", async (req, reply) => {
    const session = await sessionResolver(req);
    if (!session) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const limitRaw = req.query.limit;
    let limit = DEFAULT_LIMIT;
    if (limitRaw !== undefined) {
      const parsed = Number(limitRaw);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return reply.code(400).send({ error: "invalid_limit" });
      }
      limit = Math.min(MAX_LIMIT, Math.floor(parsed));
    }

    const [rows, telemetry] = await Promise.all([
      listLatestInsights(db, session.user_id, limit),
      getInsightTelemetry(db, session.user_id),
    ]);

    return reply.code(200).send({
      insights: rows.map((r) => ({
        id: r.id,
        text: r.insight_text,
        concept_tags: r.concept_tags,
        referenced_count: r.referenced_count,
        created_at: r.created_at.toISOString(),
        expires_at: r.expires_at?.toISOString() ?? null,
      })),
      active_count: telemetry.active_count,
      avg_referenced_count_per_insight: telemetry.avg_referenced_count_per_insight,
    });
  });
}
