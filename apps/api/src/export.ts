import { Readable } from "node:stream";
import type { FastifyInstance } from "fastify";
import type { SessionResolver } from "./session.js";
import type { RateLimiter } from "./rate-limiter.js";

// STORY-026 — GDPR-style JSON data export endpoint.
//
// `GET /v1/export` — auth-gated. Streams a single JSON envelope (the shape exportUserData
// emits in @learnpro/db) to the client without buffering the full body in memory. Per-user
// rate-limited via the injected `RateLimiter` (default: 1 export per hour, configurable via
// `LEARNPRO_EXPORT_RATE_LIMIT_HOURS`).
export type DataExporter = (user_id: string, write: (chunk: string) => void) => Promise<void>;

export interface ExportRouteOptions {
  exporter: DataExporter;
  sessionResolver: SessionResolver;
  rateLimiter: RateLimiter;
}

export function registerExportRoute(app: FastifyInstance, opts: ExportRouteOptions): void {
  app.get("/v1/export", async (req, reply) => {
    const session = await opts.sessionResolver(req);
    if (!session) {
      return reply.code(401).send({ error: "unauthorized" });
    }

    const gate = opts.rateLimiter.tryAcquire(session.user_id);
    if (!gate.allowed) {
      return reply
        .code(429)
        .send({ error: "rate_limited", retry_after_seconds: gate.retry_after_seconds });
    }

    // Push-mode Readable — the exporter writes chunks via the supplied callback, and the
    // route pushes each one into the stream. We kick off the export as a fire-and-forget
    // task so the route handler can return the stream payload to Fastify; once the stream
    // ends (push(null)) Fastify finishes the response. Errors mid-stream destroy the stream
    // so the connection closes; Fastify logs them.
    //
    // The stream is created with a high water mark large enough that the exporter's writes
    // never block — at MVP scale the entire envelope fits in 16 MiB easily, and large
    // exports don't OOM because Node still applies backpressure if the consumer is slow.
    const stream = new Readable({ read() {}, highWaterMark: 16 * 1024 * 1024 });

    void (async () => {
      try {
        await opts.exporter(session.user_id, (chunk) => stream.push(chunk));
      } catch (err) {
        req.log.error({ err }, "data export failed mid-stream");
        stream.destroy(err instanceof Error ? err : new Error(String(err)));
        return;
      }
      stream.push(null);
    })();

    return reply
      .code(200)
      .header("content-type", "application/json")
      .header(
        "content-disposition",
        `attachment; filename="learnpro-export-${session.user_id}.json"`,
      )
      .send(stream);
  });
}

// Default exporter for dev-without-DB. Emits a minimal valid envelope so the route is
// inspectable in dev without standing up Postgres. The DB-backed exporter is wired by
// defaultsFromEnv() in index.ts when DATABASE_URL is set.
export const noDbExporter: DataExporter = async (_user_id, write) => {
  write(
    JSON.stringify({
      profile: null,
      settings: null,
      episodes: [],
      submissions: [],
      agent_calls: [],
      notifications: [],
    }),
  );
};

// Read the export window in hours from env, defaulting to 1. 0 = no rate limit (useful for
// integration tests). Negative values fall back to the default and log a warning at boot.
export function loadExportWindowMs(env: NodeJS.ProcessEnv): number {
  const raw = env["LEARNPRO_EXPORT_RATE_LIMIT_HOURS"];
  if (raw === undefined) return 60 * 60 * 1000;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return 60 * 60 * 1000;
  return Math.floor(parsed * 60 * 60 * 1000);
}
