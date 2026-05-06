import { inArray } from "drizzle-orm";
import { concepts, getDueConcepts, withOverdueDays, type LearnProDb } from "@learnpro/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { SessionResolver } from "./session.js";

// STORY-031 — `GET /v1/spaced-repetition/due`. Returns the user's currently-due concept review
// queue, joined with the human-readable concept slug + name and an integer days_overdue (>= 0).
// Bounded to 50 by the @learnpro/db helper.

export const DueConceptResponseItemSchema = z.object({
  concept_id: z.string(),
  slug: z.string(),
  name: z.string(),
  last_reviewed: z.string().datetime().nullable(),
  days_overdue: z.number().int().min(0),
});
export type DueConceptResponseItem = z.infer<typeof DueConceptResponseItemSchema>;

export const DueConceptsResponseSchema = z.object({
  due_concepts: z.array(DueConceptResponseItemSchema),
});

export interface SpacedRepetitionRouteOptions {
  db: LearnProDb;
  sessionResolver: SessionResolver;
}

export function registerSpacedRepetitionRoutes(
  app: FastifyInstance,
  opts: SpacedRepetitionRouteOptions,
): void {
  const { db, sessionResolver } = opts;

  app.get("/v1/spaced-repetition/due", async (req, reply) => {
    const session = await sessionResolver(req);
    if (!session) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const now = new Date();
    const due = await getDueConcepts(db, session.user_id, now);
    if (due.length === 0) {
      return reply.code(200).send({ due_concepts: [] });
    }
    const enriched = withOverdueDays(due, now);
    const ids = enriched.map((d) => d.concept_id);
    const conceptRows = await db
      .select({ id: concepts.id, slug: concepts.slug, name: concepts.name })
      .from(concepts)
      .where(inArray(concepts.id, ids));
    const conceptById = new Map(conceptRows.map((r) => [r.id, r]));
    const items: DueConceptResponseItem[] = [];
    for (const row of enriched) {
      const c = conceptById.get(row.concept_id);
      if (!c) continue;
      items.push({
        concept_id: row.concept_id,
        slug: c.slug,
        name: c.name,
        last_reviewed: row.state.last_reviewed,
        days_overdue: row.days_overdue,
      });
    }
    return reply.code(200).send({ due_concepts: items });
  });
}
