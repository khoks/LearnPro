import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";

export const runtime = "nodejs";

const DEFAULT_API_URL = "http://localhost:4000";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const FinishBodySchema = z.object({
  outcome: z.enum(["passed", "passed_with_hints", "failed", "abandoned", "revealed"]).optional(),
  reveal_clicked: z.boolean().optional(),
});

// Browser → Next.js → Fastify proxy for `POST /v1/tutor/episodes/:id/finish`. Body is fully
// optional: the tutor harness derives a sensible final outcome from the live state when the UI
// doesn't pass one explicitly. Forwards the Auth.js session cookie so apps/api can resolve the
// user.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json(
      { error: "invalid_request", message: "episode id must be a UUID" },
      { status: 400 },
    );
  }

  // The body is optional — `{}` is valid. Treat a missing/blank body as `{}`, but reject malformed
  // JSON loudly so the UI can surface a banner.
  let json: unknown = {};
  try {
    const text = await req.text();
    if (text.length > 0) json = JSON.parse(text);
  } catch {
    return NextResponse.json(
      { error: "invalid_json", message: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const parsed = FinishBodySchema.safeParse(json);
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
    upstream = await fetch(`${apiUrl}/v1/tutor/episodes/${encodeURIComponent(id)}/finish`, {
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
