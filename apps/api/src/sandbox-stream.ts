import { Readable } from "node:stream";
import type { FastifyInstance } from "fastify";
import {
  SandboxRequestError,
  SandboxRunChunkSchema,
  SandboxRunRequestSchema,
  type SandboxProvider,
  type SandboxRunChunk,
} from "@learnpro/sandbox";

// STORY-059 — Server-Sent Events streaming for sandbox runs.
//
// `POST /v1/sandbox/run/stream` — same body shape as `POST /sandbox/run`. Response is
// `text/event-stream` (SSE framing). v1 fake-streams: the underlying `SandboxProvider.run()`
// is request/response (Piston's HTTP API doesn't stream); the route splits the stdout/stderr
// into newline-delimited chunks and emits one SSE event per chunk, ending with exactly one
// `exit` event that carries the run metadata.
//
// Telemetry is emitted exactly once per stream — on the `run()` call inside `runStream()`,
// before any chunks ship.
//
// Note on method: SSE doesn't strictly require GET. The shape of the request body
// (multi-line code, stdin) is incompatible with GET query params; POST keeps the body
// schema identical to `/sandbox/run` and is the standard for modern streaming endpoints.
// The web client uses `fetch` + ReadableStream reader (not `EventSource`).
export interface SandboxStreamRouteOptions {
  sandbox: SandboxProvider;
}

export function registerSandboxStreamRoute(
  app: FastifyInstance,
  opts: SandboxStreamRouteOptions,
): void {
  app.post("/v1/sandbox/run/stream", async (req, reply) => {
    const parsed = SandboxRunRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request", issues: parsed.error.issues });
    }

    const stream = new Readable({ read() {}, highWaterMark: 1 * 1024 * 1024 });
    const ctrl = new AbortController();

    // Client disconnect — abort the inner provider's iterator so we don't keep streaming
    // chunks into a dead socket. Fastify gives us the underlying socket via `req.raw`.
    req.raw.on("close", () => {
      if (!ctrl.signal.aborted) ctrl.abort();
    });

    void (async () => {
      try {
        for await (const chunk of opts.sandbox.runStream(parsed.data, ctrl.signal)) {
          stream.push(formatSse(chunk));
          if (chunk.type === "exit") break;
        }
      } catch (err) {
        if (err instanceof SandboxRequestError) {
          req.log.warn({ err }, "sandbox provider error mid-stream");
          stream.push(formatSseError({ error: "sandbox_unavailable", message: err.message }));
        } else {
          req.log.error({ err }, "sandbox stream failed");
          stream.push(formatSseError({ error: "stream_failed" }));
        }
      } finally {
        stream.push(null);
      }
    })();

    return reply
      .code(200)
      .header("content-type", "text/event-stream")
      .header("cache-control", "no-cache")
      .header("connection", "keep-alive")
      .header("x-accel-buffering", "no")
      .send(stream);
  });
}

// SSE wire format: `event: <type>\ndata: <json>\n\n`. We use the chunk's `type` as the SSE
// event name (`stdout` / `stderr` / `exit`) and put the parsed Zod-validated chunk JSON in
// `data`. Validating on the way out keeps the contract honest even if a future provider
// emits an off-shape chunk.
function formatSse(chunk: SandboxRunChunk): string {
  const validated = SandboxRunChunkSchema.parse(chunk);
  return `event: ${validated.type}\ndata: ${JSON.stringify(validated)}\n\n`;
}

function formatSseError(payload: { error: string; message?: string }): string {
  return `event: error\ndata: ${JSON.stringify(payload)}\n\n`;
}
