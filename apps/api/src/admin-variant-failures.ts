import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { listVariantGateFailures, type LearnProDb } from "@learnpro/db";
import type { SessionResolver } from "./session.js";

// STORY-039e — Admin-only Fastify route for inspecting failed-gate LLM-generated problem
// variants. Strictly read-only — never offers retry / delete / publish actions on failed
// variants (that would be a separate Story if/when needed). Auth-gated via the standard
// session cookie + `users.is_admin = true` flag (operator promotes via psql).
//
// The route is registered only when an `adminVariantFailuresDb` is supplied to `buildServer`
// (mirrors the pattern of every other DB-bound route). On miss, the route falls through to
// Fastify's default 404.

const QuerySchema = z.object({
  source_problem_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export interface AdminVariantFailuresRouteOptions {
  db: LearnProDb;
  sessionResolver: SessionResolver;
}

export function registerAdminVariantFailuresRoutes(
  app: FastifyInstance,
  opts: AdminVariantFailuresRouteOptions,
): void {
  const { db, sessionResolver } = opts;

  app.get("/v1/admin/variant-failures", async (req, reply) => {
    const session = await sessionResolver(req);
    if (!session) return reply.code(401).send({ error: "unauthorized" });
    if (!session.is_admin) return reply.code(403).send({ error: "forbidden" });

    const parsed = QuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request", issues: parsed.error.issues });
    }

    const result = await listVariantGateFailures(db, {
      ...(parsed.data.source_problem_id !== undefined
        ? { source_problem_id: parsed.data.source_problem_id }
        : {}),
      ...(parsed.data.limit !== undefined ? { limit: parsed.data.limit } : {}),
      ...(parsed.data.offset !== undefined ? { offset: parsed.data.offset } : {}),
    });

    return reply.code(200).send({
      failures: result.failures.map((f) => ({
        id: f.id,
        source_problem_id: f.source_problem_id,
        source_problem_slug: f.source_problem_slug,
        attempted_at: f.attempted_at.toISOString(),
        failure_reason: f.failure_reason,
        failure_detail: f.failure_detail,
        model_id: f.model_id,
        attempt_number: f.attempt_number,
      })),
      total: result.total,
    });
  });
}
