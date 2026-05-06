import { NextResponse } from "next/server";
import { headers } from "next/headers";

export const runtime = "nodejs";

const DEFAULT_API_URL = "http://localhost:4000";

// STORY-046 — proxy for `POST /v1/today-plan/replan`. Forwards the session cookie so
// the apps/api session resolver can identify the user. Body is empty — the route doesn't
// take any user-supplied parameters.

export async function POST(): Promise<Response> {
  const apiUrl = process.env["LEARNPRO_API_URL"] ?? DEFAULT_API_URL;
  const incoming = await headers();
  const cookie = incoming.get("cookie") ?? "";
  let upstream: Response;
  try {
    upstream = await fetch(`${apiUrl}/v1/today-plan/replan`, {
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
