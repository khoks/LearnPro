import { countSuccessfulEpisodes, type LearnProDb } from "@learnpro/db";
import type { FastifyInstance } from "fastify";
import type { SessionResolver } from "./session.js";

// STORY-044 — `GET /v1/dashboard/install-eligible` exposes whether the user has earned the right
// to see the "Install LearnPro" prompt on the dashboard. Eligibility = ≥3 successful episodes
// (passed | passed_with_hints). Showing the install prompt cold-start (on first visit) is a
// dark-pattern; we wait until the user has demonstrably stuck around long enough to want the
// installed-app convenience.
//
// Server-side dismissal is NOT in scope here — the frontend persists "don't ask again" in
// localStorage. The server only answers "does this user qualify?". Auth-gated; anonymous returns
// 401 (the dashboard requires auth too, so an anonymous client should never reach this).

export const INSTALL_PROMPT_THRESHOLD = 3;

export interface InstallEligibleRouteOptions {
  db: LearnProDb;
  sessionResolver: SessionResolver;
}

export function registerInstallEligibleRoutes(
  app: FastifyInstance,
  opts: InstallEligibleRouteOptions,
): void {
  const { db, sessionResolver } = opts;

  app.get("/v1/dashboard/install-eligible", async (req, reply) => {
    const session = await sessionResolver(req);
    if (!session) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const successful_episodes = await countSuccessfulEpisodes(db, session.user_id);
    const eligible = successful_episodes >= INSTALL_PROMPT_THRESHOLD;
    return reply.code(200).send({
      eligible,
      successful_episodes,
      threshold: INSTALL_PROMPT_THRESHOLD,
    });
  });
}
