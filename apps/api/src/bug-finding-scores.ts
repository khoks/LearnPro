import { listBugFindingScores, type LearnProDb } from "@learnpro/db";
import type { FastifyInstance } from "fastify";
import type { SessionResolver } from "./session.js";

// STORY-037a — `GET /v1/bug-finding-scores` exposes the user's per-archetype bug-finding EWMA so
// the dashboard / profile can render "you're strong at off-by-one, weaker at default-arg
// mutability" copy. Auth-gated. Always returns all 8 archetypes (untouched archetypes report
// the cold-start uniform prior of score=0.5 with attempts=0) so the UI doesn't have to wait
// for the user to encounter every archetype before showing a complete picture.

export interface BugFindingScoresRouteOptions {
  db: LearnProDb;
  sessionResolver: SessionResolver;
}

export function registerBugFindingScoresRoutes(
  app: FastifyInstance,
  opts: BugFindingScoresRouteOptions,
): void {
  const { db, sessionResolver } = opts;

  app.get("/v1/bug-finding-scores", async (req, reply) => {
    const session = await sessionResolver(req);
    if (!session) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const scores = await listBugFindingScores(db, session.user_id, session.org_id);
    return reply.code(200).send({
      scores: scores.map((s) => ({
        bug_archetype: s.archetype,
        score: s.score,
        confidence: s.confidence,
        attempts: s.attempts,
      })),
    });
  });
}
