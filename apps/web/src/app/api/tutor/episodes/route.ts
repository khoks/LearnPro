import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";

export const runtime = "nodejs";

const DEFAULT_API_URL = "http://localhost:4000";

const StartEpisodeBodySchema = z.object({
  track_id: z.string().uuid(),
});

// Browser → Next.js → Fastify proxy for `POST /v1/tutor/episodes`. Forwards the Auth.js session
// cookie so apps/api's findSessionUser can resolve the caller; Zod-validates the body so a
// malformed payload doesn't even leave the box.
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

  const parsed = StartEpisodeBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const apiUrl = process.env["LEARNPRO_API_URL"] ?? DEFAULT_API_URL;
  const incoming = await headers();
  const cookie = incoming.get("cookie") ?? "";
  let upstream: Response;
  try {
    upstream = await fetch(`${apiUrl}/v1/tutor/episodes`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(cookie ? { cookie } : {}),
      },
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

  const body = await upstream.text();
  return new NextResponse(body, {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
  });
}
