import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";

export const runtime = "nodejs";

const DEFAULT_API_URL = "http://localhost:4000";
const SLUG_RE = /^[a-z0-9-]+$/;

const CompleteBodySchema = z.object({
  episode_id: z.string().uuid(),
});

// Browser → Next.js → Fastify proxy for `POST /v1/session-plan/items/:slug/complete`. Validates
// the slug + body before round-tripping; everything else (auth, no_active_plan, etc.) is the
// upstream's job to surface.
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  if (!SLUG_RE.test(slug)) {
    return NextResponse.json(
      { error: "invalid_request", message: "slug must be kebab-case" },
      { status: 400 },
    );
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_json", message: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const parsed = CompleteBodySchema.safeParse(json);
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
    upstream = await fetch(`${apiUrl}/v1/session-plan/items/${encodeURIComponent(slug)}/complete`, {
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
