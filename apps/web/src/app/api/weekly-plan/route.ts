import { NextResponse } from "next/server";
import { headers } from "next/headers";

export const runtime = "nodejs";

const DEFAULT_API_URL = "http://localhost:4000";

// STORY-046b — proxy for `GET /v1/weekly-plan` and `POST /v1/weekly-plan/replan`. Forwards
// the session cookie + an optional `track_slug` query param so the apps/api session resolver
// can identify the user and the route can pin to a specific track.

export async function GET(request: Request): Promise<Response> {
  const apiUrl = process.env["LEARNPRO_API_URL"] ?? DEFAULT_API_URL;
  const incoming = await headers();
  const cookie = incoming.get("cookie") ?? "";
  const url = new URL(request.url);
  const upstreamUrl = new URL(`${apiUrl}/v1/weekly-plan`);
  const trackSlug = url.searchParams.get("track_slug");
  if (trackSlug) upstreamUrl.searchParams.set("track_slug", trackSlug);
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

export async function POST(request: Request): Promise<Response> {
  const apiUrl = process.env["LEARNPRO_API_URL"] ?? DEFAULT_API_URL;
  const incoming = await headers();
  const cookie = incoming.get("cookie") ?? "";
  const url = new URL(request.url);
  const upstreamUrl = new URL(`${apiUrl}/v1/weekly-plan/replan`);
  const trackSlug = url.searchParams.get("track_slug");
  if (trackSlug) upstreamUrl.searchParams.set("track_slug", trackSlug);
  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl.toString(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(cookie ? { cookie } : {}),
      },
      body: "{}",
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
