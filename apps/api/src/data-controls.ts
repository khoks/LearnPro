import type { FastifyInstance } from "fastify";
import type { SessionResolver } from "./session.js";

// STORY-056 — user-facing data control routes. The actual DB work lives in
// `@learnpro/db.{getUserDataSummary, deleteUserVoiceTranscripts, deleteUserAccount}`. The route
// layer here only handles auth + result shaping + cookie clearing.

export interface DataControlsAdapters {
  summary: (user_id: string) => Promise<{
    episodes_count: number;
    submissions_count: number;
    interactions_count: number;
    agent_calls_count: number;
    voice_transcripts_count: number;
    last_active_at: string | null;
  }>;
  deleteVoice: (user_id: string) => Promise<number>;
  deleteAccount: (user_id: string) => Promise<{
    deleted: boolean;
    deleted_user_id: string;
    sessions_invalidated: number;
  }>;
}

export interface RegisterDataControlsRoutesOptions {
  adapters: DataControlsAdapters;
  sessionResolver: SessionResolver;
}

// The Auth.js cookie name. Hardcoded here so apps/api can clear it when an account is deleted —
// it matches the default Next-Auth dev cookie. SaaS / prod over HTTPS uses the `__Secure-` prefix
// — apps/web sets the cookie name and apps/api just needs to clear both shapes.
const SESSION_COOKIE_NAMES = ["next-auth.session-token", "__Secure-next-auth.session-token"];

export function registerDataControlsRoutes(
  app: FastifyInstance,
  opts: RegisterDataControlsRoutesOptions,
): void {
  app.get("/v1/data/summary", async (req, reply) => {
    const session = await opts.sessionResolver(req);
    if (!session) return reply.code(401).send({ error: "unauthorized" });
    const summary = await opts.adapters.summary(session.user_id);
    return reply.code(200).send(summary);
  });

  app.delete("/v1/data/voice", async (req, reply) => {
    const session = await opts.sessionResolver(req);
    if (!session) return reply.code(401).send({ error: "unauthorized" });
    const deleted = await opts.adapters.deleteVoice(session.user_id);
    return reply.code(200).send({ deleted });
  });

  app.delete("/v1/data/account", async (req, reply) => {
    const session = await opts.sessionResolver(req);
    if (!session) return reply.code(401).send({ error: "unauthorized" });
    const result = await opts.adapters.deleteAccount(session.user_id);
    if (!result.deleted) return reply.code(404).send({ error: "user_not_found" });
    // Clear both the dev (`next-auth.session-token`) and prod (`__Secure-next-auth.session-token`)
    // cookie names. Fastify's `header(name, value)` overwrites; multi-cookie Set-Header is set via
    // an array. The Path=/ + Max-Age=0 combo expires the cookie immediately.
    const expired = SESSION_COOKIE_NAMES.map(
      (name) => `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`,
    );
    void reply.header("set-cookie", expired);
    return reply.code(200).send({
      deleted: true,
      sessions_invalidated: result.sessions_invalidated,
    });
  });
}
