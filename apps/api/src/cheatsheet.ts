import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  createCheatsheet,
  episodes as episodesTable,
  findCheatsheetForEpisodes,
  getCheatsheetForUser,
  listCheatsheetsForUser,
  problems as problemsTable,
  submissions as submissionsTable,
  updateCheatsheetMarkdown,
  type CheatsheetEntry,
  type CheatsheetView,
  type LearnProDb,
} from "@learnpro/db";
import {
  cheatsheetAgent,
  entriesToMarkdown,
  type CheatsheetAgentResult,
} from "@learnpro/agent";
import type { LLMProvider } from "@learnpro/llm";
import type { CheatsheetEpisodeInput } from "@learnpro/prompts";
import type { SessionResolver } from "./session.js";

// STORY-041 — four auth-gated cheatsheet endpoints:
//   GET  /v1/cheatsheets                 — paginated history for the signed-in user
//   GET  /v1/cheatsheets/:id             — single cheatsheet (entries + markdown)
//   PUT  /v1/cheatsheets/:id             — update the user-editable markdown
//   POST /v1/cheatsheets                 — generate a fresh cheatsheet from a list of episode IDs
//                                           (idempotent within an existing match)
//   POST /v1/cheatsheets/:id/export      — return the cheatsheet markdown (PDF rendered client-side)

export interface CheatsheetEpisodeFetcher {
  // Loads the per-episode context the agent needs. Returns the matched subset only — episode
  // IDs that don't belong to the user (or don't exist) are silently dropped, and the route
  // surfaces a 400 if none survive. Implementations live in apps/api wiring; tests inject a
  // fake. Importantly, the fetcher MUST scope by user_id so a stolen episode_id can't leak
  // anyone else's session.
  fetch(input: { user_id: string; episode_ids: ReadonlyArray<string> }): Promise<
    ReadonlyArray<CheatsheetEpisodeInput>
  >;
}

export interface CheatsheetRouteOptions {
  db: LearnProDb;
  llm: LLMProvider;
  episodeFetcher: CheatsheetEpisodeFetcher;
  sessionResolver: SessionResolver;
  // Override the agent's max_entries (defaults to 6). Tests use this to assert the cap is
  // forwarded; not exposed to the public route surface.
  max_entries?: number;
}

const ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const IdParamSchema = z.string().uuid();

const PutBodySchema = z.object({
  markdown_content: z.string().min(1).max(20_000),
});

const PostBodySchema = z.object({
  episode_ids: z.array(z.string().uuid()).min(1).max(20),
});

export function registerCheatsheetRoutes(
  app: FastifyInstance,
  opts: CheatsheetRouteOptions,
): void {
  const { db, llm, episodeFetcher, sessionResolver } = opts;

  app.get("/v1/cheatsheets", async (req, reply) => {
    const session = await sessionResolver(req);
    if (!session) return reply.code(401).send({ error: "unauthorized" });
    const q = ListQuerySchema.safeParse(req.query);
    if (!q.success) {
      return reply.code(400).send({ error: "invalid_request", issues: q.error.issues });
    }
    const items = await listCheatsheetsForUser(db, {
      user_id: session.user_id,
      ...(q.data.limit !== undefined ? { limit: q.data.limit } : {}),
      ...(q.data.offset !== undefined ? { offset: q.data.offset } : {}),
    });
    return reply.code(200).send({ items: items.map(serializeCheatsheet) });
  });

  app.get<{ Params: { id: string } }>("/v1/cheatsheets/:id", async (req, reply) => {
    const session = await sessionResolver(req);
    if (!session) return reply.code(401).send({ error: "unauthorized" });
    const idParse = IdParamSchema.safeParse(req.params.id);
    if (!idParse.success) {
      return reply.code(400).send({ error: "invalid_request", message: "id must be a uuid" });
    }
    const view = await getCheatsheetForUser(db, idParse.data, session.user_id);
    if (!view) return reply.code(404).send({ error: "cheatsheet_not_found" });
    return reply.code(200).send({ cheatsheet: serializeCheatsheet(view) });
  });

  app.put<{ Params: { id: string } }>("/v1/cheatsheets/:id", async (req, reply) => {
    const session = await sessionResolver(req);
    if (!session) return reply.code(401).send({ error: "unauthorized" });
    const idParse = IdParamSchema.safeParse(req.params.id);
    if (!idParse.success) {
      return reply.code(400).send({ error: "invalid_request", message: "id must be a uuid" });
    }
    const bodyParse = PutBodySchema.safeParse(req.body);
    if (!bodyParse.success) {
      return reply.code(400).send({ error: "invalid_request", issues: bodyParse.error.issues });
    }
    const updated = await updateCheatsheetMarkdown(db, {
      user_id: session.user_id,
      cheatsheet_id: idParse.data,
      markdown_content: bodyParse.data.markdown_content,
    });
    if (!updated) return reply.code(404).send({ error: "cheatsheet_not_found" });
    return reply.code(200).send({ cheatsheet: serializeCheatsheet(updated) });
  });

  // POST /v1/cheatsheets — generate from a list of episode IDs. Idempotent: if a cheatsheet
  // already covers exactly this set of episodes, return it instead of re-generating. This is
  // the same shape the (future) cron worker calls; surfacing it as an HTTP route lets the
  // session-recap UI generate-on-demand when the cron hasn't fired yet (e.g. dev / tests).
  app.post("/v1/cheatsheets", async (req, reply) => {
    const session = await sessionResolver(req);
    if (!session) return reply.code(401).send({ error: "unauthorized" });
    const bodyParse = PostBodySchema.safeParse(req.body);
    if (!bodyParse.success) {
      return reply.code(400).send({ error: "invalid_request", issues: bodyParse.error.issues });
    }
    const sortedEpisodeIds = [...bodyParse.data.episode_ids].sort();

    // Idempotency check: if a cheatsheet already covers this exact episode set, return it.
    const existing = await findCheatsheetForEpisodes(db, session.user_id, sortedEpisodeIds);
    if (existing) {
      return reply
        .code(200)
        .send({ cheatsheet: serializeCheatsheet(existing), generated: false });
    }

    const episodes = await episodeFetcher.fetch({
      user_id: session.user_id,
      episode_ids: sortedEpisodeIds,
    });
    if (episodes.length === 0) {
      return reply.code(400).send({
        error: "no_episodes_for_user",
        message: "None of the supplied episode_ids belong to the signed-in user.",
      });
    }

    let agentResult: CheatsheetAgentResult;
    try {
      agentResult = await cheatsheetAgent({
        llm,
        user_id: session.user_id,
        episodes,
        ...(opts.max_entries !== undefined ? { max_entries: opts.max_entries } : {}),
      });
    } catch (err) {
      req.log.warn({ err }, "cheatsheet agent failed — surfacing 503");
      return reply.code(503).send({
        error: "cheatsheet_unavailable",
        message: "The cheatsheet agent is briefly unavailable. Try again in a moment.",
      });
    }

    const markdown = entriesToMarkdown(agentResult.entries, { date: new Date() });
    const view = await createCheatsheet(db, {
      user_id: session.user_id,
      episodes_covered: sortedEpisodeIds,
      entries: agentResult.entries,
      markdown_content: markdown,
    });
    return reply
      .code(201)
      .send({ cheatsheet: serializeCheatsheet(view), generated: true });
  });

  // POST /v1/cheatsheets/:id/export — returns the markdown content as a download. The
  // client-side <CheatsheetTab> renders the same content as a printable HTML page and
  // delegates the actual PDF generation to jspdf in the browser. Returning markdown keeps
  // this endpoint server-side simple AND lets the caller swap the rendering layer (PDF /
  // print stylesheet / .md download) without an API change.
  app.post<{ Params: { id: string } }>(
    "/v1/cheatsheets/:id/export",
    async (req, reply) => {
      const session = await sessionResolver(req);
      if (!session) return reply.code(401).send({ error: "unauthorized" });
      const idParse = IdParamSchema.safeParse(req.params.id);
      if (!idParse.success) {
        return reply.code(400).send({ error: "invalid_request", message: "id must be a uuid" });
      }
      const view = await getCheatsheetForUser(db, idParse.data, session.user_id);
      if (!view) return reply.code(404).send({ error: "cheatsheet_not_found" });
      return reply
        .code(200)
        .header("content-type", "text/markdown; charset=utf-8")
        .header(
          "content-disposition",
          `attachment; filename="learnpro-cheatsheet-${view.id}.md"`,
        )
        .send(view.markdown_content);
    },
  );
}

function serializeCheatsheet(view: CheatsheetView): {
  id: string;
  episodes_covered: string[];
  entries: CheatsheetEntry[];
  markdown_content: string;
  created_at: string;
  updated_at: string;
} {
  return {
    id: view.id,
    episodes_covered: view.episodes_covered,
    entries: view.entries,
    markdown_content: view.markdown_content,
    created_at: view.created_at.toISOString(),
    updated_at: view.updated_at.toISOString(),
  };
}

const USER_CODE_EXCERPT_LIMIT = 600;

// Build the production DB-backed fetcher. Fetches the joined episode + problem rows that
// belong to the user, plus the most-recent submission's code (truncated) for the agent's
// "code excerpt" hint. Episode IDs that don't belong to the user (or don't exist) are
// silently dropped — the route surfaces the empty case as 400.
export function buildDbCheatsheetEpisodeFetcher(db: LearnProDb): CheatsheetEpisodeFetcher {
  return {
    async fetch(input) {
      if (input.episode_ids.length === 0) return [];
      const rows = await db
        .select({
          episode_id: episodesTable.id,
          hints_used: episodesTable.hints_used,
          final_outcome: episodesTable.final_outcome,
          problem_slug: problemsTable.slug,
          problem_name: problemsTable.name,
          problem_language: problemsTable.language,
          problem_difficulty: problemsTable.difficulty,
          problem_statement: problemsTable.statement,
          concept_tags: problemsTable.hidden_tests,
        })
        .from(episodesTable)
        .innerJoin(problemsTable, eq(episodesTable.problem_id, problemsTable.id))
        .where(
          and(
            inArray(episodesTable.id, [...input.episode_ids]),
            eq(episodesTable.user_id, input.user_id),
          ),
        );

      const out: CheatsheetEpisodeInput[] = [];
      for (const r of rows) {
        const subRows = await db
          .select({ code: submissionsTable.code })
          .from(submissionsTable)
          .where(eq(submissionsTable.episode_id, r.episode_id))
          .orderBy(desc(submissionsTable.submitted_at))
          .limit(1);
        const code = subRows[0]?.code ?? null;
        const concept_tags = extractConceptTags(r.concept_tags);
        out.push({
          problem_slug: r.problem_slug,
          problem_name: r.problem_name,
          language: r.problem_language,
          difficulty: r.problem_difficulty,
          concept_tags,
          final_outcome: r.final_outcome,
          hints_used: r.hints_used,
          user_code_excerpt: code ? truncate(code, USER_CODE_EXCERPT_LIMIT) : null,
          problem_statement: r.problem_statement,
        });
      }
      return out;
    },
  };
}

function extractConceptTags(hidden_tests: unknown): string[] {
  if (!hidden_tests || typeof hidden_tests !== "object") return [];
  const obj = hidden_tests as Record<string, unknown>;
  const tags = obj["concept_tags"];
  if (!Array.isArray(tags)) return [];
  return tags.filter((t): t is string => typeof t === "string");
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
