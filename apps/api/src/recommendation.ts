import {
  getProfileTargetRole,
  getTracksBySlugs,
  type LearnProDb,
  type TrackSummary,
} from "@learnpro/db";
import { ROLE_LIBRARY, getRecommendation, type Role, type RoleLibrary } from "@learnpro/profile";
import type { FastifyInstance } from "fastify";
import type { SessionResolver } from "./session.js";

// STORY-021 — career-aware recommendation. The conversational onboarding agent (STORY-053)
// captures `target_role` into `profiles.target_role`. This endpoint maps that string through
// the role library (@learnpro/profile) and joins the role's `recommended_track_slugs` against
// the seeded `tracks` table to return clickable rows for the /recommended page.
//
// Two non-success shapes are intentionally distinct so the page can render the right copy:
//   * No profile or no `target_role` set yet  → 200 { role: null, ... } (the page redirects to
//     /dashboard when it sees this; we don't 404 because the user is legitimately authenticated).
//   * `target_role` set but unknown to the library → 200 { role: null, ... } (free choice, no
//     soft-locks: an unknown role just means we have nothing tailored — the page falls back).
// Returning the same null-shape for both cases keeps the page state machine simple.

export interface RecommendationRouteOptions {
  db: LearnProDb;
  sessionResolver: SessionResolver;
  // Override for tests — defaults to the library shipped in @learnpro/profile.
  library?: RoleLibrary;
}

export interface RecommendationResponse {
  role: { slug: string; label: string; bias: Role["bias"] } | null;
  recommended_tracks: TrackSummary[];
  recommended_daily_minutes: number | null;
}

export function registerRecommendationRoute(
  app: FastifyInstance,
  opts: RecommendationRouteOptions,
): void {
  const { db, sessionResolver } = opts;
  const library = opts.library ?? ROLE_LIBRARY;

  app.get("/v1/recommendation", async (req, reply) => {
    const session = await sessionResolver(req);
    if (!session) {
      return reply.code(401).send({ error: "unauthorized" });
    }

    const profile = await getProfileTargetRole(db, session.user_id);
    const target = profile?.target_role ?? null;
    if (!target) {
      return reply.code(200).send({
        role: null,
        recommended_tracks: [],
        recommended_daily_minutes: null,
      } satisfies RecommendationResponse);
    }

    const role = getRecommendation(library, target);
    if (!role) {
      return reply.code(200).send({
        role: null,
        recommended_tracks: [],
        recommended_daily_minutes: null,
      } satisfies RecommendationResponse);
    }

    const tracks = await getTracksBySlugs(db, role.recommended_track_slugs, session.org_id);
    return reply.code(200).send({
      role: { slug: role.slug, label: role.label, bias: role.bias },
      recommended_tracks: tracks,
      recommended_daily_minutes: role.recommended_daily_minutes,
    } satisfies RecommendationResponse);
  });
}
