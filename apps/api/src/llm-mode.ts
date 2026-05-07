import { z } from "zod";
import {
  TutorModeSchema,
  getTutorMode,
  updateTutorMode,
  type LearnProDb,
} from "@learnpro/db";
import { DEFAULT_OLLAMA_BASE_URL, DEFAULT_OLLAMA_MODEL } from "@learnpro/llm";
import type { FastifyInstance } from "fastify";
import type { SessionResolver } from "./session.js";

// STORY-036 — settings GET / PUT for the per-user tutor_mode toggle. Auth-gated like the
// other /v1/settings/* routes. The Ollama base URL + model are operator-level config (env
// vars), not per-user; we surface them in the GET response so the UI can display the
// effective configuration the user's `local` / `auto-fallback` calls would route to.

export interface LlmModeRouteOptions {
  db: LearnProDb;
  sessionResolver: SessionResolver;
  ollamaBaseUrl?: string;
  ollamaModel?: string;
}

const PutBodySchema = z.object({ mode: TutorModeSchema });

export function registerLlmModeRoutes(
  app: FastifyInstance,
  opts: LlmModeRouteOptions,
): void {
  const { db, sessionResolver } = opts;
  const ollamaBaseUrl = opts.ollamaBaseUrl ?? DEFAULT_OLLAMA_BASE_URL;
  const ollamaModel = opts.ollamaModel ?? DEFAULT_OLLAMA_MODEL;

  app.get("/v1/settings/llm-mode", async (req, reply) => {
    const session = await sessionResolver(req);
    if (!session) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const mode = await getTutorMode(db, session.user_id);
    return reply.code(200).send({
      mode,
      ollama_base_url: ollamaBaseUrl,
      ollama_model: ollamaModel,
    });
  });

  app.put("/v1/settings/llm-mode", async (req, reply) => {
    const session = await sessionResolver(req);
    if (!session) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const parsed = PutBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request", issues: parsed.error.issues });
    }
    await updateTutorMode({
      db,
      user_id: session.user_id,
      org_id: session.org_id,
      mode: parsed.data.mode,
    });
    return reply.code(200).send({
      mode: parsed.data.mode,
      ollama_base_url: ollamaBaseUrl,
      ollama_model: ollamaModel,
    });
  });
}
