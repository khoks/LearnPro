import { NextResponse } from "next/server";
import { headers } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_API_URL = "http://localhost:4000";

// STORY-040 — proxy for POST /v1/portfolio/push.
export async function POST(req: Request): Promise<Response> {
  const apiUrl = process.env["LEARNPRO_API_URL"] ?? DEFAULT_API_URL;
  const incoming = await headers();
  const cookie = incoming.get("cookie") ?? "";
  const body = await req.text();
  let upstream: Response;
  try {
    upstream = await fetch(`${apiUrl}/v1/portfolio/push`, {
      method: "POST",
      headers: {
        ...(cookie ? { cookie } : {}),
        "content-type": "application/json",
      },
      body,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "api_unreachable", message: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
  const responseBody = await upstream.text();
  return new NextResponse(responseBody, {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
  });
}
