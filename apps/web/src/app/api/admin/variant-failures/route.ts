import { NextResponse } from "next/server";
import { headers } from "next/headers";

export const runtime = "nodejs";

const DEFAULT_API_URL = "http://localhost:4000";

// STORY-039e — proxy for `GET /v1/admin/variant-failures`. Forwards the Auth.js cookie so
// apps/api can resolve the user + verify the `users.is_admin = true` flag. Forwards query
// parameters (source_problem_id / limit / offset) verbatim. Read-only: only GET is wired.
export async function GET(req: Request): Promise<Response> {
  const apiUrl = process.env["LEARNPRO_API_URL"] ?? DEFAULT_API_URL;
  const incoming = await headers();
  const cookie = incoming.get("cookie") ?? "";
  const incomingUrl = new URL(req.url);
  const upstreamUrl = new URL(`${apiUrl}/v1/admin/variant-failures`);
  for (const [k, v] of incomingUrl.searchParams.entries()) {
    upstreamUrl.searchParams.append(k, v);
  }
  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl.toString(), {
      method: "GET",
      headers: { ...(cookie ? { cookie } : {}) },
    });
  } catch (err) {
    return NextResponse.json(
      { error: "api_unreachable", message: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
  const body = await upstream.text();
  return new NextResponse(body, {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
  });
}
