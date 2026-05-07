import { NextResponse } from "next/server";
import { headers } from "next/headers";

export const runtime = "nodejs";

const DEFAULT_API_URL = "http://localhost:4000";

// STORY-033 — proxy for `GET /v1/profile-insights`. Read-only; forwards the session cookie so
// the apps/api session resolver can identify the user. Same shape as the spaced-repetition
// proxy.

export async function GET(req: Request): Promise<Response> {
  const apiUrl = process.env["LEARNPRO_API_URL"] ?? DEFAULT_API_URL;
  const incoming = await headers();
  const cookie = incoming.get("cookie") ?? "";
  // Forward the `limit` query string when present; cap is enforced by the API route itself.
  const url = new URL(req.url);
  const target = new URL(`${apiUrl}/v1/profile-insights`);
  const limit = url.searchParams.get("limit");
  if (limit !== null) target.searchParams.set("limit", limit);
  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), {
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
