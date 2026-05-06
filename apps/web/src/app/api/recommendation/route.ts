import { NextResponse } from "next/server";
import { headers } from "next/headers";

export const runtime = "nodejs";

const DEFAULT_API_URL = "http://localhost:4000";

// STORY-021 — proxy for `GET /v1/recommendation`. Forwards the Auth.js cookie so apps/api can
// resolve the user via the cross-app sessions lookup. Same shape as the other Next.js → Fastify
// proxies (data/summary, settings/quiet-hours, etc.).
export async function GET(): Promise<Response> {
  const apiUrl = process.env["LEARNPRO_API_URL"] ?? DEFAULT_API_URL;
  const incoming = await headers();
  const cookie = incoming.get("cookie") ?? "";
  let upstream: Response;
  try {
    upstream = await fetch(`${apiUrl}/v1/recommendation`, {
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
