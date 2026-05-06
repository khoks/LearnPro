import { countClosedEpisodes, getConfidenceSignal, type LearnProDb } from "@learnpro/db";
import { combinedScore, DEFAULT_EWMA_BANDED_AUTONOMY_CONFIG, scoreToBand } from "@learnpro/scoring";
import type { FastifyInstance } from "fastify";
import type { SessionResolver } from "./session.js";

// STORY-054 — `GET /v1/autonomy/state` exposes the user's current autonomy band so the
// dashboard can render "Tutor autonomy: Low" (or whichever band) with coach-voice copy. The
// route is auth-gated; the body shape mirrors what the EwmaBandedAutonomyPolicy uses internally
// (signal + episode_count + computed band) so the UI can display the rationale.
//
// Cold-start behaviour:
//   - signal is null (brand-new user, no closes yet) → band is "low".
//   - episode_count < cold_start_episodes → band is "low" (cold-start safety).
//   - otherwise the policy's `combinedScore` + `scoreToBand` math runs over the persisted signal.

export interface AutonomyRouteOptions {
  db: LearnProDb;
  sessionResolver: SessionResolver;
}

export function registerAutonomyRoutes(app: FastifyInstance, opts: AutonomyRouteOptions): void {
  const { db, sessionResolver } = opts;

  app.get("/v1/autonomy/state", async (req, reply) => {
    const session = await sessionResolver(req);
    if (!session) {
      return reply.code(401).send({ error: "unauthorized" });
    }

    const [signal, episode_count] = await Promise.all([
      getConfidenceSignal(db, session.user_id),
      countClosedEpisodes(db, session.user_id),
    ]);

    const cfg = DEFAULT_EWMA_BANDED_AUTONOMY_CONFIG;
    const isColdStart = signal === null || episode_count < cfg.cold_start_episodes;
    const score = signal === null ? 0 : combinedScore(signal, cfg);
    const band = isColdStart ? "low" : scoreToBand(score, cfg);

    return reply.code(200).send({
      band,
      signal,
      episode_count,
      cold_start_threshold: cfg.cold_start_episodes,
      combined_score: score,
    });
  });
}
