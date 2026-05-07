import { NextResponse } from "next/server";
import { SandboxRunRequestSchema } from "@learnpro/sandbox";

export const runtime = "nodejs";

const DEFAULT_API_URL = "http://localhost:4000";

// STORY-059 — Next.js Route Handler proxy for the SSE streaming endpoint. Validates the
// request body with the same Zod schema as `/api/sandbox/run`, forwards to the Fastify API,
// and pipes the upstream `text/event-stream` body straight back to the browser.
export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_json", message: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const parsed = SandboxRunRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const apiUrl = process.env["LEARNPRO_API_URL"] ?? DEFAULT_API_URL;
  let upstream: Response;
  try {
    upstream = await fetch(`${apiUrl}/v1/sandbox/run/stream`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(parsed.data),
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "api_unreachable",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }

  // Pass through the upstream stream body. NextResponse accepts a ReadableStream directly,
  // so chunks flow to the browser without buffering.
  const headers = new Headers();
  headers.set("content-type", upstream.headers.get("content-type") ?? "text/event-stream");
  headers.set("cache-control", "no-cache");
  headers.set("x-accel-buffering", "no");
  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers,
  });
}
