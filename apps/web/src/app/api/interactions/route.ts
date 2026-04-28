import { InteractionsBatchSchema } from "@learnpro/shared";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const DEFAULT_API_URL = "http://localhost:4000";

// Browser → Next.js → Fastify proxy. Same shape as the /api/sandbox/run handler:
// validate the body with Zod here so a malformed batch doesn't even leave the box,
// then forward the (now trusted) JSON upstream and pipe the response back.
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

  const parsed = InteractionsBatchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const apiUrl = process.env["LEARNPRO_API_URL"] ?? DEFAULT_API_URL;
  let upstream: Response;
  try {
    upstream = await fetch(`${apiUrl}/v1/interactions`, {
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

  const body = await upstream.text();
  return new NextResponse(body, {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
  });
}
